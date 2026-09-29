import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { LLM_JSON_ATTEMPTS } from "@/domain/constants";
import { llmCalls } from "@/server/db/schema";
import type { ChatMessage, LLMClient } from "@/server/llm/client";
import {
  LLMNotConfiguredError,
  LLMOutputError,
  LLMTruncatedError,
  LLMUnavailableError,
} from "@/server/llm/errors";
import { runTask, type TaskDef } from "@/server/llm/run-task";
import { saveLLMSettings } from "@/server/llm/settings";
import { createTestDb, type TestDb } from "../helpers/db";
import { withFakeLLM } from "../helpers/llm";

const Output = z.object({ name: z.string().min(1), score: z.number().int().min(1).max(5) });
type Out = z.infer<typeof Output>;

const def: TaskDef<{ topic: string }, Out> = {
  name: "scenario",
  promptVersion: "scenario@test",
  temperature: 0.5,
  schema: Output,
  build: (input) => [
    { role: "system", content: "系统提示" },
    { role: "user", content: input.topic },
  ],
  validate: (out) => (out.name === "禁用" ? ["name：不能是“禁用”"] : []),
  fake: () => ({ name: "假数据", score: 3 }),
};

/** 按顺序返回预设的响应（字符串）或抛出预设的错误，并记录每次请求。 */
function stubClient(script: (string | Error)[]) {
  const requests: { messages: ChatMessage[]; signal?: AbortSignal; json: boolean }[] = [];
  const client: LLMClient = {
    model: "stub-model",
    async complete(req) {
      requests.push({ messages: [...req.messages], signal: req.signal, json: req.json });
      const next = script[requests.length - 1];
      if (next instanceof Error) throw next;
      return { text: next, promptTokens: 10, completionTokens: 5 };
    },
  };
  return { client, requests };
}

describe("runTask", () => {
  let testDb: TestDb;
  const saved = { ...process.env };

  beforeEach(() => {
    testDb = createTestDb();
    delete process.env.AXIOM_FAKE_LLM;
    for (const k of ["AXIOM_LLM_BASE_URL", "AXIOM_LLM_API_KEY", "AXIOM_LLM_MODEL"]) delete process.env[k];
  });

  afterEach(() => {
    testDb.close();
    process.env = { ...saved };
  });

  const calls = () => testDb.db.select().from(llmCalls).all().sort((a, b) => a.attempt - b.attempt);

  it("第一次非法 JSON、第二次 schema 不符、第三次正确：带修正提示重试并写入 3 条 llm_calls", async () => {
    const { client, requests } = stubClient([
      "抱歉，我先解释一下……",
      '{"name": "示例", "score": 9}',
      '```json\n{"name": "示例", "score": 4}\n```',
    ]);

    const out = await runTask(def, { topic: "主题" }, { client, db: testDb.db, refType: "scenario", refId: "s-1" });

    expect(out).toEqual({ name: "示例", score: 4 });
    expect(requests).toHaveLength(3);
    expect(requests[0].messages).toHaveLength(2);
    expect(requests[0].json).toBe(true);

    // 第 2 次请求：带上一次的输出与“不是合法 JSON”的修正提示
    expect(requests[1].messages).toHaveLength(4);
    expect(requests[1].messages[2]).toEqual({ role: "assistant", content: "抱歉，我先解释一下……" });
    expect(requests[1].messages[3].role).toBe("user");
    expect(requests[1].messages[3].content).toContain("你上一次的输出不符合要求");
    expect(requests[1].messages[3].content).toContain("输出中没有找到 JSON 对象");

    // 第 3 次请求：带 schema 错误的中文路径描述
    expect(requests[2].messages).toHaveLength(6);
    expect(requests[2].messages[5].content).toContain("score：不能大于 5");
    expect(requests[2].messages[5].content).toContain("只输出 JSON");

    const rows = calls();
    expect(rows.map((r) => [r.attempt, r.status])).toEqual([
      [1, "invalid_output"],
      [2, "invalid_output"],
      [3, "ok"],
    ]);
    expect(rows[0]).toMatchObject({ task: "scenario", refType: "scenario", refId: "s-1", model: "stub-model" });
    expect(rows[2]).toMatchObject({ promptTokens: 10, completionTokens: 5 });
    expect(rows[1].error).toContain("score：不能大于 5");
  });

  it("语义校验失败也会触发重试", async () => {
    const { client, requests } = stubClient([
      '{"name": "禁用", "score": 3}',
      '{"name": "可用", "score": 3}',
    ]);
    const out = await runTask(def, { topic: "t" }, { client, db: testDb.db });
    expect(out.name).toBe("可用");
    expect(requests[1].messages.at(-1)?.content).toContain("不能是“禁用”");
  });

  it("三次都失败时抛 LLMOutputError", async () => {
    const { client, requests } = stubClient(Array(LLM_JSON_ATTEMPTS).fill("不是 JSON"));
    const err = await runTask(def, { topic: "t" }, { client, db: testDb.db }).catch((e) => e);
    expect(err).toBeInstanceOf(LLMOutputError);
    expect((err as LLMOutputError).task).toBe("scenario");
    expect(requests).toHaveLength(LLM_JSON_ATTEMPTS);
    expect(calls().every((r) => r.status === "invalid_output")).toBe(true);
    expect(calls()).toHaveLength(LLM_JSON_ATTEMPTS);
  });

  it("截断当作一次无效输出，修正提示要求更精简", async () => {
    const { client, requests } = stubClient([
      new LLMTruncatedError('{"name": "半截', 10, 100),
      '{"name": "完整", "score": 2}',
    ]);
    const out = await runTask(def, { topic: "t" }, { client, db: testDb.db });
    expect(out.name).toBe("完整");
    expect(requests[1].messages.at(-1)?.content).toContain("更精简");
    expect(calls()[0]).toMatchObject({ status: "invalid_output", completionTokens: 100 });
  });

  it("传输错误不重试，记录 transport_error 后原样抛出", async () => {
    const { client, requests } = stubClient([new LLMUnavailableError("端点挂了")]);
    await expect(runTask(def, { topic: "t" }, { client, db: testDb.db })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(requests).toHaveLength(1);
    expect(calls()).toMatchObject([{ status: "transport_error", error: "端点挂了", responseText: null }]);
  });

  it("透传 AbortSignal；已中止时不发请求", async () => {
    const controller = new AbortController();
    const { client, requests } = stubClient(['{"name": "a", "score": 1}']);
    await runTask(def, { topic: "t" }, { client, db: testDb.db, signal: controller.signal });
    expect(requests[0].signal).toBe(controller.signal);

    controller.abort();
    await expect(
      runTask(def, { topic: "t" }, { client, db: testDb.db, signal: controller.signal }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });

  it("未配置且非 Fake 模式时抛 LLMNotConfiguredError", async () => {
    await expect(runTask(def, { topic: "t" }, { db: testDb.db })).rejects.toBeInstanceOf(
      LLMNotConfiguredError,
    );
  });

  it("配置完整时不抛未配置（用已中止的 signal 避免真实请求）", async () => {
    saveLLMSettings({ baseUrl: "http://localhost:1/v1", apiKey: "changeme", model: "m" }, testDb.db);
    const err = await runTask(def, { topic: "t" }, { db: testDb.db, signal: AbortSignal.abort() }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LLMNotConfiguredError);
  });

  describe("Fake 模式", () => {
    it("无需配置与客户端即可运行，且不写 llm_calls", async () => {
      const restore = withFakeLLM();
      try {
        expect(await runTask(def, { topic: "t" }, { db: testDb.db })).toEqual({ name: "假数据", score: 3 });
        expect(calls()).toHaveLength(0);
      } finally {
        restore();
      }
    });

    it("fake() 输出不通过校验时抛错", async () => {
      const restore = withFakeLLM();
      try {
        const bad: TaskDef<{ topic: string }, Out> = { ...def, fake: () => ({ name: "", score: 3 }) };
        await expect(runTask(bad, { topic: "t" }, { db: testDb.db })).rejects.toThrow("fake()");
      } finally {
        restore();
      }
    });
  });
});
