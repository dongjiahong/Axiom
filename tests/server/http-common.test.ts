import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, errorResponse, parseJson, route } from "@/server/http";
import {
  LLMNotConfiguredError,
  LLMOutputError,
  LLMUnavailableError,
} from "@/server/llm/errors";
import {
  correctionPrompt,
  formatIssuePath,
  outputFormatPrompt,
  zodErrorToMessages,
} from "@/server/prompts/common";

describe("zodErrorToMessages", () => {
  const schema = z.object({
    keyPointVerdicts: z.array(
      z.object({ quality: z.number().int().min(1).max(5), verdict: z.enum(["done", "missed"]) }),
    ),
    title: z.string().min(1),
    tags: z.array(z.string()).min(1).max(3),
  });

  function messages(value: unknown): string[] {
    const r = schema.safeParse(value);
    if (r.success) throw new Error("应当校验失败");
    return zodErrorToMessages(r.error);
  }

  it("路径用数组下标与点号，说明为中文", () => {
    const out = messages({
      keyPointVerdicts: [{ quality: 6, verdict: "done" }, { quality: 1, verdict: "done" }, { quality: 0, verdict: "x" }],
      title: "t",
      tags: ["a"],
    });
    expect(out).toContain("keyPointVerdicts[0].quality：不能大于 5");
    expect(out).toContain("keyPointVerdicts[2].quality：不能小于 1");
    expect(out).toContain('keyPointVerdicts[2].verdict：应为以下之一："done"、"missed"');
  });

  it("缺字段、类型不对、数组与字符串长度", () => {
    const out = messages({ keyPointVerdicts: "x", tags: [] });
    expect(out).toContain("keyPointVerdicts：类型不对，应为数组");
    expect(out).toContain("title：缺少必填字段（应为字符串）");
    expect(out).toContain("tags：至少需要 1 项");
    expect(messages({ keyPointVerdicts: [], title: "", tags: ["a", "b", "c", "d"] })).toEqual(
      expect.arrayContaining(["title：长度不能小于 1", "tags：最多 3 项"]),
    );
  });

  it("非整数与根对象", () => {
    expect(messages({ keyPointVerdicts: [{ quality: 1.5, verdict: "done" }], title: "t", tags: ["a"] })).toContain(
      "keyPointVerdicts[0].quality：类型不对，应为整数",
    );
    expect(messages("x")[0]).toMatch(/^根对象：/);
    expect(formatIssuePath([])).toBe("根对象");
  });
});

describe("提示词片段", () => {
  it("correctionPrompt 列出全部错误", () => {
    const text = correctionPrompt(["a：错误一", "b：错误二"]);
    expect(text).toBe(
      "你上一次的输出不符合要求：\n- a：错误一\n- b：错误二\n请修正后重新输出完整的 JSON 对象。只输出 JSON，不要任何解释或代码块标记。",
    );
  });

  it("outputFormatPrompt 包含格式要求与 schema 描述", () => {
    const text = outputFormatPrompt("{ a: string }");
    expect(text).toContain("【输出格式】");
    expect(text).toContain("只输出一个 JSON 对象");
    expect(text).toContain("{ a: string }");
  });
});

describe("http", () => {
  async function body(res: Response) {
    return (await res.json()) as { error: { code: string; message: string } };
  }

  it("AI 错误映射到约定的状态码与 code", async () => {
    const notConfigured = errorResponse(new LLMNotConfiguredError());
    expect(notConfigured.status).toBe(409);
    expect(await body(notConfigured)).toEqual({
      error: { code: "llm_not_configured", message: "请先在设置页配置 AI 模型" },
    });

    const invalid = errorResponse(new LLMOutputError("debrief", ["x"]));
    expect(invalid.status).toBe(502);
    expect((await body(invalid)).error.code).toBe("llm_invalid_output");

    const unavailable = errorResponse(new LLMUnavailableError("无法连接到 AI 端点"));
    expect(unavailable.status).toBe(502);
    expect(await body(unavailable)).toEqual({
      error: { code: "llm_unavailable", message: "无法连接到 AI 端点" },
    });
  });

  it("ApiError 原样映射；未知错误为 500 且不泄露细节", async () => {
    const notFound = errorResponse(new ApiError(404, "not_found", "找不到"));
    expect(notFound.status).toBe(404);
    expect((await body(notFound)).error).toEqual({ code: "not_found", message: "找不到" });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const unknown = errorResponse(new Error("secret internal detail"));
    log.mockRestore();
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await body(unknown))).not.toContain("secret internal detail");
  });

  it("parseJson：合法、非法 JSON、校验失败", async () => {
    const schema = z.object({ n: z.number().int().min(4) });
    const make = (text: string) => new Request("http://x/api", { method: "PUT", body: text });

    expect(await parseJson(make('{"n": 5}'), schema)).toEqual({ n: 5 });

    const bad = await parseJson(make("not json"), schema).catch((e) => e);
    expect(bad).toMatchObject({ status: 400, code: "invalid_input" });

    const invalid = await parseJson(make('{"n": 1}'), schema).catch((e) => e);
    expect(invalid).toMatchObject({ status: 400, code: "invalid_input" });
    expect(invalid.message).toContain("n：不能小于 4");
  });

  it("route 包装：成功返回 JSON，抛错统一映射", async () => {
    const ok = await route(async () => ({ a: 1 }))();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ a: 1 });

    const failed = await route(async () => {
      throw new LLMNotConfiguredError();
    })();
    expect(failed.status).toBe(409);
  });
});
