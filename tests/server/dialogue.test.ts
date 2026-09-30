import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MESSAGE_MAX_CHARS } from "@/domain/constants";
import {
  debriefs,
  messages,
  methodologies,
  practiceSessions,
  scenarios,
  settings,
  tags,
} from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { LLMUnavailableError } from "@/server/llm/errors";
import { buildCounterpartMessages, type CounterpartInput } from "@/server/prompts/counterpart";
import {
  createPractice,
  endSession,
  getSession,
  regenerateReply,
  sendMessage,
  startSession,
  type CounterpartFn,
} from "@/server/services/practice";

import { makeKeyPoint, makeMethodologyBody, makeStep } from "../fixtures/methodology";
import { createTestDb, type TestDb } from "../helpers/db";
import { withFakeLLM } from "../helpers/llm";

let test: TestDb;
let restore: () => void;

beforeAll(() => {
  restore = withFakeLLM();
  test = createTestDb();
});

afterAll(() => {
  test.close();
  restore();
});

beforeEach(() => {
  test.db.delete(debriefs).run();
  test.db.delete(messages).run();
  test.db.delete(practiceSessions).run();
  test.db.delete(scenarios).run();
  test.db.delete(methodologies).run();
  test.db.delete(tags).run();
  test.db.delete(settings).run();
});

function addMethodology(): string {
  const id = nanoid();
  const now = Date.now();
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: null,
      status: "confirmed",
      name: "向领导提加薪",
      body: makeMethodologyBody({
        steps: [
          makeStep({ title: "预约合适的时机", keyPoints: [makeKeyPoint()] }),
          makeStep({ title: "对方拒绝时追问条件", conditional: true, trigger: "对方以预算为由拒绝" }),
        ],
      }),
      originChunkIds: [],
      createdBy: "seed",
      version: 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
    })
    .run();
  return id;
}

/** 创建并开始一场专项练习；`opening` 决定对方是否先开口。 */
async function activeSession(
  opts: { opening?: boolean; maxTurns?: number } = {},
): Promise<string> {
  const methodologyId = addMethodology();
  const { sessionId } = await createPractice(
    {
      selection: "pick",
      methodologyId,
      scope: { tagIds: [], sourceIds: [] },
      difficulty: "neutral",
    },
    { database: test.db },
  );
  const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
  if (opts.opening === false) {
    test.db
      .update(scenarios)
      .set({ openingSpeaker: "user", openingLine: null })
      .where(eq(scenarios.id, session.scenarioId))
      .run();
  }
  if (opts.maxTurns !== undefined) {
    test.db
      .update(practiceSessions)
      .set({ maxTurns: opts.maxTurns })
      .where(eq(practiceSessions.id, sessionId))
      .run();
  }
  startSession(sessionId, test.db);
  return sessionId;
}

function rowsOf(sessionId: string) {
  return test.db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))
    .all();
}

function sessionRow(sessionId: string) {
  return test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
}

async function expectApiError(fn: () => Promise<unknown> | unknown, status: number) {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return (err as ApiError).message;
  }
  throw new Error(`期望抛出 ${status} 错误，但没有抛出`);
}

const opts = () => ({ database: test.db });

describe("sendMessage：turn 与消息落库", () => {
  it("对方有开场白：开场白 turn 0，用户第 k 条与其后的回复 turn = k，seq 连续", async () => {
    const id = await activeSession();
    const first = await sendMessage(id, "王总，方便聊聊吗？", opts());
    expect(first.messages.map((m) => [m.role, m.turn])).toEqual([
      ["user", 1],
      ["counterpart", 1],
    ]);
    await sendMessage(id, "我想谈谈薪资。", opts());

    expect(rowsOf(id).map((m) => [m.seq, m.role, m.turn])).toEqual([
      [1, "counterpart", 0],
      [2, "user", 1],
      [3, "counterpart", 1],
      [4, "user", 2],
      [5, "counterpart", 2],
    ]);
  });

  it("用户先开口：第一条用户消息 turn 1、seq 1", async () => {
    const id = await activeSession({ opening: false });
    await sendMessage(id, "王总，方便聊聊吗？", opts());
    expect(rowsOf(id).map((m) => [m.seq, m.role, m.turn])).toEqual([
      [1, "user", 1],
      [2, "counterpart", 1],
    ]);
  });

  it("回复 meta 已保存（Fake 第 1 轮触发 r1），但 active 状态的 DTO 不下发 meta", async () => {
    const id = await activeSession();
    const result = await sendMessage(id, "王总，方便聊聊吗？", opts());
    expect(rowsOf(id)[2].meta).toEqual({ firedResistanceIds: ["r1"], end: null });
    expect(JSON.stringify(result)).not.toContain("firedResistanceIds");
    const dto = getSession(id, test.db);
    expect(dto.turn).toBe(1);
    expect(dto.messages.every((m) => !("meta" in m))).toBe(true);
    expect(result.session).toEqual({
      status: "active",
      endReason: null,
      endNote: null,
      turn: 1,
      maxTurns: dto.maxTurns,
    });
  });

  it("传给对方任务的历史包含开场白、本轮轮次和 maxTurns", async () => {
    const id = await activeSession({ maxTurns: 5 });
    const seen: CounterpartInput[] = [];
    const counterpart: CounterpartFn = async (input) => {
      seen.push(input);
      return { reply: "嗯", firedResistanceIds: [], end: null };
    };
    await sendMessage(id, "你好", { ...opts(), counterpart });
    await sendMessage(id, "再聊聊", { ...opts(), counterpart });
    expect(seen[1].turn).toBe(2);
    expect(seen[1].maxTurns).toBe(5);
    expect(seen[1].history.map((m) => m.role)).toEqual(["counterpart", "user", "counterpart", "user"]);
  });

  it("消息内容校验：空白与超长返回 400，且不落库", async () => {
    const id = await activeSession();
    const before = rowsOf(id).length;
    await expectApiError(() => sendMessage(id, "   ", opts()), 400);
    await expectApiError(() => sendMessage(id, "长".repeat(MESSAGE_MAX_CHARS + 1), opts()), 400);
    expect(rowsOf(id)).toHaveLength(before);
  });
});

describe("结束判定", () => {
  it("对方 end 非空：会话结束，endReason / endNote 正确", async () => {
    const id = await activeSession();
    const result = await sendMessage(id, "谢谢您，那就这么定了", opts());
    expect(result.session.status).toBe("ended");
    expect(result.session.endReason).toBe("agreed");
    expect(result.session.endNote).toBe("对方接受了你的请求。");

    const row = sessionRow(id);
    expect(row.status).toBe("ended");
    expect(row.endReason).toBe("agreed");
    expect(row.endedAt).not.toBeNull();
    // 结束后仍不揭晓 meta
    expect(getSession(id, test.db).messages.every((m) => !("meta" in m))).toBe(true);
  });

  it.each(["broke_down", "closed"] as const)("对方宣告 %s", async (type) => {
    const id = await activeSession();
    const counterpart: CounterpartFn = async () => ({
      reply: "就到这吧。",
      firedResistanceIds: [],
      end: { type, note: "结束了" },
    });
    const result = await sendMessage(id, "你好", { ...opts(), counterpart });
    expect(result.session.endReason).toBe(type);
  });

  it("达到 maxTurns：以 turn_limit 结束，endNote 为空", async () => {
    const id = await activeSession({ maxTurns: 2 });
    const first = await sendMessage(id, "第一句", opts());
    expect(first.session.status).toBe("active");
    const second = await sendMessage(id, "第二句", opts());
    expect(second.session.status).toBe("ended");
    expect(second.session.endReason).toBe("turn_limit");
    expect(second.session.endNote).toBeNull();
  });

  it("到达 maxTurns 的同一轮对方宣告结束时，以对方的结束方式为准", async () => {
    const id = await activeSession({ maxTurns: 1 });
    const result = await sendMessage(id, "谢谢", opts());
    expect(result.session.endReason).toBe("agreed");
  });

  it("最后一轮的提示被加入传给模型的 messages", async () => {
    const id = await activeSession({ maxTurns: 2 });
    const prompts: string[] = [];
    const counterpart: CounterpartFn = async (input) => {
      prompts.push(buildCounterpartMessages(input)[0].content);
      return { reply: "嗯", firedResistanceIds: [], end: null };
    };
    await sendMessage(id, "第一句", { ...opts(), counterpart });
    await sendMessage(id, "第二句", { ...opts(), counterpart });
    expect(prompts[0]).toContain("本轮是第 1/2 轮。");
    expect(prompts[0]).not.toContain("这是最后一轮");
    expect(prompts[1]).toContain("本轮是第 2/2 轮。这是最后一轮");
  });

  it("已结束的会话发消息 / 重试 / 再次结束 → 409", async () => {
    const id = await activeSession();
    await sendMessage(id, "谢谢", opts());
    await expectApiError(() => sendMessage(id, "还有一句", opts()), 409);
    await expectApiError(() => regenerateReply(id, opts()), 409);
    await expectApiError(() => endSession(id, test.db), 409);
    expect(rowsOf(id).filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("briefing 状态发消息 → 409", async () => {
    const methodologyId = addMethodology();
    const { sessionId } = await createPractice(
      {
        selection: "pick",
        methodologyId,
        scope: { tagIds: [], sourceIds: [] },
        difficulty: "neutral",
      },
      opts(),
    );
    await expectApiError(() => sendMessage(sessionId, "你好", opts()), 409);
  });
});

describe("对方回复失败与重试", () => {
  const failing: CounterpartFn = async () => {
    throw new LLMUnavailableError("AI 端点不可用");
  };

  it("失败：用户消息保留；再发消息 409；regenerate 后恢复", async () => {
    const id = await activeSession();
    await expect(sendMessage(id, "你好", { ...opts(), counterpart: failing })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(rowsOf(id).map((m) => m.role)).toEqual(["counterpart", "user"]);
    expect(sessionRow(id).status).toBe("active");

    const message = await expectApiError(() => sendMessage(id, "第二句", opts()), 409);
    expect(message).toContain("重试生成回复");
    expect(rowsOf(id)).toHaveLength(2);

    const result = await regenerateReply(id, opts());
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ role: "counterpart", turn: 1 });
    expect(rowsOf(id).map((m) => [m.seq, m.role, m.turn])).toEqual([
      [1, "counterpart", 0],
      [2, "user", 1],
      [3, "counterpart", 1],
    ]);

    await sendMessage(id, "第二句", opts());
    expect(rowsOf(id).at(-1)).toMatchObject({ role: "counterpart", turn: 2 });
  });

  it("regenerate 可以多次失败后再成功；最后一条不是用户消息时 409", async () => {
    const id = await activeSession();
    await expectApiError(() => regenerateReply(id, opts()), 409); // 只有开场白
    await expect(sendMessage(id, "你好", { ...opts(), counterpart: failing })).rejects.toThrow();
    await expect(regenerateReply(id, { ...opts(), counterpart: failing })).rejects.toThrow();
    await regenerateReply(id, opts());
    await expectApiError(() => regenerateReply(id, opts()), 409);
  });

  it("重试在最后一轮生成的回复同样触发 turn_limit 结束", async () => {
    const id = await activeSession({ maxTurns: 1 });
    await expect(sendMessage(id, "你好", { ...opts(), counterpart: failing })).rejects.toThrow();
    const result = await regenerateReply(id, opts());
    expect(result.session.endReason).toBe("turn_limit");
  });

  it("生成期间用户手动结束：回复不再写入，返回 409", async () => {
    const id = await activeSession();
    const counterpart: CounterpartFn = async () => {
      endSession(id, test.db);
      return { reply: "嗯", firedResistanceIds: [], end: null };
    };
    await expectApiError(() => sendMessage(id, "你好", { ...opts(), counterpart }), 409);
    expect(rowsOf(id).map((m) => m.role)).toEqual(["counterpart", "user"]);
    expect(sessionRow(id)).toMatchObject({ status: "ended", endReason: "user" });
  });
});

describe("endSession", () => {
  it("没有用户消息：会话（及开场白）被删除", async () => {
    const id = await activeSession();
    expect(endSession(id, test.db)).toEqual({ deleted: true });
    expect(test.db.select().from(practiceSessions).where(eq(practiceSessions.id, id)).all()).toHaveLength(0);
    expect(test.db.select().from(messages).where(eq(messages.sessionId, id)).all()).toHaveLength(0);
  });

  it("有用户消息：ended，endReason = user", async () => {
    const id = await activeSession();
    await sendMessage(id, "你好", opts());
    const dto = endSession(id, test.db);
    expect(dto).toMatchObject({ status: "ended", endReason: "user", endNote: null });
    expect(sessionRow(id).endedAt).not.toBeNull();
  });

  it("最后一条是生成失败的用户消息时也可以结束", async () => {
    const id = await activeSession();
    await expect(
      sendMessage(id, "你好", {
        ...opts(),
        counterpart: async () => {
          throw new LLMUnavailableError("不可用");
        },
      }),
    ).rejects.toThrow();
    expect(endSession(id, test.db)).toMatchObject({ status: "ended", endReason: "user" });
  });

  it("briefing 状态结束 → 409；不存在 → 404", async () => {
    const methodologyId = addMethodology();
    const { sessionId } = await createPractice(
      {
        selection: "pick",
        methodologyId,
        scope: { tagIds: [], sourceIds: [] },
        difficulty: "neutral",
      },
      opts(),
    );
    await expectApiError(() => endSession(sessionId, test.db), 409);
    await expectApiError(() => endSession("missing", test.db), 404);
  });
});
