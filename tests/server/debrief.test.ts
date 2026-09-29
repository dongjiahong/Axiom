import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MethodologyBody } from "@/domain/schemas";
import {
  debriefs,
  messages,
  methodologies,
  practiceSessions,
  scenarios,
  settings,
  tags,
  verdicts,
} from "@/server/db/schema";
import { OverrideInput } from "@/server/dto/debrief";
import type { CreatePracticeInput } from "@/server/dto/session";
import { ApiError } from "@/server/http";
import { LLMUnavailableError } from "@/server/llm/errors";
import { debriefTask, type DebriefInput, type DebriefOutput } from "@/server/prompts/debrief";
import {
  clearOverride,
  generateDebrief,
  getDebrief,
  overrideVerdict,
  type DebriefFn,
} from "@/server/services/debrief";
import {
  createPractice,
  endSession,
  getSession,
  selectMethodology,
  sendMessage,
  startSession,
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

const USER_LINES = [
  "领导您好，我想和您约个时间聊聊我今年的工作成果。",
  "去年我把客户流失率从百分之十二降到了百分之八，这是有数据支持的。",
  "我理解预算紧张，那么需要满足什么条件才能考虑加薪呢？",
];

/** 4 个非条件要点（分属两个步骤）、1 个条件步骤（1 个要点）、2 条原则、1 个概念。 */
function body(orderMode: "strict" | "loose" = "strict"): MethodologyBody {
  return makeMethodologyBody({
    orderMode,
    steps: [
      makeStep({ title: "预约合适的时机", keyPoints: [makeKeyPoint("提前预约"), makeKeyPoint("说明谈话主题")] }),
      makeStep({ title: "用数据陈述贡献", keyPoints: [makeKeyPoint("列出具体成果"), makeKeyPoint("量化成果")] }),
      makeStep({
        title: "对方拒绝时追问条件",
        conditional: true,
        trigger: "对方以预算为由拒绝",
        keyPoints: [makeKeyPoint("询问条件与时间表")],
      }),
    ],
    principles: [
      { id: nanoid(), excerpt: null, inferred: true, kind: "dont", text: "不威胁离职" },
      { id: nanoid(), excerpt: null, inferred: true, kind: "do", text: "保持尊重" },
    ],
    concepts: [
      { id: nanoid(), excerpt: null, inferred: true, name: "锚定效应", explanation: "解释", relatedStepIds: [] },
    ],
  });
}

function addMethodology(name: string, orderMode: "strict" | "loose" = "strict"): string {
  const id = nanoid();
  const now = Date.now();
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: null,
      status: "confirmed",
      name,
      body: body(orderMode),
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

const emptyScope = { tagIds: [], sourceIds: [], methodologyIds: [] };

async function talk(sessionId: string, lines = USER_LINES): Promise<void> {
  for (const line of lines) await sendMessage(sessionId, line, { database: test.db });
  endSession(sessionId, test.db);
}

/** 一场已结束、尚未复盘的专项练习。 */
async function endedDrill(orderMode: "strict" | "loose" = "strict"): Promise<string> {
  const methodologyId = addMethodology("向领导提加薪", orderMode);
  const { sessionId } = await createPractice(
    {
      mode: "drill",
      selection: "pick",
      methodologyId,
      scope: { ...emptyScope, methodologyIds: [methodologyId] },
      difficulty: "neutral",
    },
    { database: test.db },
  );
  startSession(sessionId, test.db);
  await talk(sessionId);
  return sessionId;
}

/** 一场已结束的综合测验：`pick` 决定用户选目标、备选还是无关的方法论。 */
async function endedQuiz(pick: "target" | "alternative" | "other"): Promise<{ sessionId: string; ids: string[] }> {
  const ids = [addMethodology("方法甲"), addMethodology("方法乙"), addMethodology("方法丙")];
  const params: CreatePracticeInput = {
    mode: "quiz",
    selection: "random",
    scope: { ...emptyScope, methodologyIds: ids },
    difficulty: "neutral",
  };
  const { sessionId } = await createPractice(params, { database: test.db });
  const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
  const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get()!;
  const alternativeId = scenario.alternatives[0].methodologyId;
  const chosen =
    pick === "target"
      ? scenario.targetMethodologyId
      : pick === "alternative"
        ? alternativeId
        : ids.find((id) => id !== scenario.targetMethodologyId && id !== alternativeId)!;
  selectMethodology(sessionId, chosen, test.db);
  startSession(sessionId, test.db);
  await talk(sessionId);
  return { sessionId, ids };
}

function rowsOf(sessionId: string) {
  const debrief = test.db.select().from(debriefs).where(eq(debriefs.sessionId, sessionId)).get()!;
  const list = test.db.select().from(verdicts).where(eq(verdicts.debriefId, debrief.id)).all();
  return { debrief, verdicts: list };
}

function snapshotBody(sessionId: string): MethodologyBody {
  return test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!.selectedSnapshot!
    .body;
}

/** 以 fake 输出为底稿，按需修改后作为桩返回。 */
function stub(mutate: (out: DebriefOutput, input: DebriefInput) => void): DebriefFn {
  return async (input) => {
    const out = structuredClone(debriefTask.fake(input));
    mutate(out, input);
    return out;
  };
}

function statusOf(sessionId: string): string {
  return test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!.status;
}

async function expectApiError(promise: Promise<unknown> | (() => unknown), status: number): Promise<void> {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return;
  }
  throw new Error(`期望抛出 ${status} 错误，但没有抛出`);
}

describe("Fake 模式复盘（专项练习）", () => {
  it("verdicts 数量 = 要点数 + 原则数；会话变为 debriefed", async () => {
    const sessionId = await endedDrill();
    const dto = await generateDebrief(sessionId, { database: test.db });
    const b = snapshotBody(sessionId);
    const keyPointCount = b.steps.flatMap((s) => s.keyPoints).length;

    const { debrief, verdicts: rows } = rowsOf(sessionId);
    expect(rows).toHaveLength(keyPointCount + b.principles.length);
    expect(rows.filter((r) => r.kind === "key_point")).toHaveLength(keyPointCount);
    expect(statusOf(sessionId)).toBe("debriefed");
    expect(debrief.recognition).toBeNull();
    expect(debrief.recognitionExplanation).toBeNull();
    expect(debrief.promptVersion).toBe("debrief@1");
    expect(dto.recognition).toBeNull();
    expect(dto.steps).toHaveLength(3);
    expect(dto.principles).toHaveLength(2);
    expect(dto.session.status).toBe("debriefed");
  });

  it("执行分：2 个 done（质量 4）+ 2 个 missed，条件步骤未触发被排除", async () => {
    const sessionId = await endedDrill();
    const dto = await generateDebrief(sessionId, { database: test.db });
    // 步骤1 两个要点 done(4/5)，步骤2 两个要点 missed；base = (0.8 + 0) / 2 = 40
    expect(dto.scoreBreakdown.steps.map((s) => [s.included, s.value])).toEqual([
      [true, 80],
      [true, 0],
      [false, null],
    ]);
    expect(dto.executionScore).toBe(40);
    expect(dto.holisticScore).toBe(70);
    expect(dto.outcome).toBe("unresolved");
  });

  it("证据被核对：quote 为用户真实原话", async () => {
    const sessionId = await endedDrill();
    await generateDebrief(sessionId, { database: test.db });
    const done = rowsOf(sessionId).verdicts.find((r) => r.verdict === "done")!;
    expect(done.evidence[0]).toMatchObject({ turn: 1, match: "exact" });
    expect(USER_LINES[0]).toContain(done.evidence[0].quote);
  });

  it("状态限制：进行中 409；已复盘再复盘 409；GET 未复盘 404", async () => {
    const methodologyId = addMethodology("向领导提加薪");
    const { sessionId } = await createPractice(
      {
        mode: "drill",
        selection: "pick",
        methodologyId,
        scope: { ...emptyScope, methodologyIds: [methodologyId] },
        difficulty: "neutral",
      },
      { database: test.db },
    );
    await expectApiError(generateDebrief(sessionId, { database: test.db }), 409); // briefing
    startSession(sessionId, test.db);
    await expectApiError(generateDebrief(sessionId, { database: test.db }), 409); // active
    await expectApiError(() => getDebrief(sessionId, test.db), 404);
    await sendMessage(sessionId, USER_LINES[0], { database: test.db });
    endSession(sessionId, test.db);
    await generateDebrief(sessionId, { database: test.db });
    await expectApiError(generateDebrief(sessionId, { database: test.db }), 409);
    await expectApiError(generateDebrief("不存在", { database: test.db }), 404);
  });

  it("同时触发两次只调用一次 AI", async () => {
    const sessionId = await endedDrill();
    let calls = 0;
    const fn: DebriefFn = async (input) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return debriefTask.fake(input);
    };
    const [a, b] = await Promise.all([
      generateDebrief(sessionId, { database: test.db, debrief: fn }),
      generateDebrief(sessionId, { database: test.db, debrief: fn }),
    ]);
    expect(calls).toBe(1);
    expect(a.executionScore).toBe(b.executionScore);
  });
});

describe("失败与重试", () => {
  it("AI 失败 → debrief_failed，不留下 debrief；重试成功后 debriefed", async () => {
    const sessionId = await endedDrill();
    const failing: DebriefFn = async () => {
      throw new LLMUnavailableError("端点不可用", { status: 502 });
    };
    await expect(generateDebrief(sessionId, { database: test.db, debrief: failing })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(statusOf(sessionId)).toBe("debrief_failed");
    expect(test.db.select().from(debriefs).all()).toHaveLength(0);

    await generateDebrief(sessionId, { database: test.db });
    expect(statusOf(sessionId)).toBe("debriefed");
    expect(test.db.select().from(debriefs).all()).toHaveLength(1);
  });
});

describe("证据核对与降级", () => {
  it("done 的原话找不到 → missed，保留 AI 原始判定，并标记降级", async () => {
    const sessionId = await endedDrill();
    await generateDebrief(sessionId, {
      database: test.db,
      debrief: stub((out) => {
        out.keyPointVerdicts[0].evidence = [{ turn: 1, quote: "我要求立刻涨薪百分之五十" }];
        out.keyPointVerdicts[0].rewrite = { turn: 1, original: "x", rewrite: "y", conceptRefs: [] };
      }),
    });
    const target = rowsOf(sessionId).verdicts.find((r) => r.aiVerdict === "done" && r.evidenceDowngraded)!;
    expect(target).toMatchObject({ verdict: "missed", quality: null, aiQuality: 4 });
    expect(target.evidence[0].match).toBe("none");
  });

  it("turn 错但能在其他轮找到时修正 turn", async () => {
    const sessionId = await endedDrill();
    await generateDebrief(sessionId, {
      database: test.db,
      debrief: stub((out) => {
        out.keyPointVerdicts[0].evidence = [{ turn: 1, quote: "需要满足什么条件才能考虑加薪" }];
      }),
    });
    const first = rowsOf(sessionId).verdicts.find((r) => r.evidence[0]?.turn === 3);
    expect(first).toMatchObject({ verdict: "done", evidenceDowngraded: false });
  });

  it("violated 没有有效证据 → kept；有证据则扣分", async () => {
    const sessionId = await endedDrill();
    const dto = await generateDebrief(sessionId, {
      database: test.db,
      debrief: stub((out) => {
        out.principleVerdicts[0] = { ref: "p1", verdict: "violated", evidence: [{ turn: 1, quote: "我不干了" }], comment: "x" };
        out.principleVerdicts[1] = {
          ref: "p2",
          verdict: "violated",
          evidence: [{ turn: 2, quote: "这是有数据支持的" }],
          comment: "x",
        };
      }),
    });
    const [first, second] = dto.principles;
    expect(first).toMatchObject({ verdict: "kept", aiVerdict: "violated", evidenceDowngraded: true });
    expect(second).toMatchObject({ verdict: "violated", evidenceDowngraded: false });
    expect(dto.scoreBreakdown.principlePenalty).toBe(10);
    expect(dto.executionScore).toBe(30);
  });

  it("质量分收敛：done 质量 1 → 3；partial 质量 5 → 3", async () => {
    const sessionId = await endedDrill();
    await generateDebrief(sessionId, {
      database: test.db,
      debrief: stub((out) => {
        out.keyPointVerdicts[0].quality = 1;
        out.keyPointVerdicts[1] = {
          ...out.keyPointVerdicts[1],
          verdict: "partial",
          quality: 5,
          rewrite: { turn: 1, original: "x", rewrite: "y", conceptRefs: [] },
        };
      }),
    });
    const list = rowsOf(sessionId).verdicts.filter((r) => r.kind === "key_point");
    expect(list.map((r) => [r.aiVerdict, r.aiQuality])).toContainEqual(["done", 3]);
    expect(list.map((r) => [r.aiVerdict, r.aiQuality])).toContainEqual(["partial", 3]);
  });

  it("conceptRefs 映射为真实概念 ID，非 partial/missed 的 rewrite 不保存", async () => {
    const sessionId = await endedDrill();
    await generateDebrief(sessionId, {
      database: test.db,
      debrief: stub((out) => {
        out.keyPointVerdicts[2].rewrite = { turn: 2, original: "原话", rewrite: "建议", conceptRefs: ["c1"] };
        out.keyPointVerdicts[0].rewrite = { turn: 1, original: "原话", rewrite: "建议", conceptRefs: [] };
      }),
    });
    const conceptId = snapshotBody(sessionId).concepts[0].id;
    const rows = rowsOf(sessionId).verdicts;
    expect(rows.find((r) => r.rewrite?.conceptIds.includes(conceptId))?.verdict).toBe("missed");
    expect(rows.filter((r) => r.verdict === "done").every((r) => r.rewrite === null)).toBe(true);
  });

  it("严格顺序：后一步骤先于前一步骤出现 → 扣 10；loose 不扣", async () => {
    for (const [orderMode, penalty] of [["strict", 10], ["loose", 0]] as const) {
      const sessionId = await endedDrill(orderMode);
      const dto = await generateDebrief(sessionId, {
        database: test.db,
        debrief: stub((out) => {
          // 步骤1（k1,k2）出现在第 3 轮，步骤2（k3,k4）出现在第 1 轮，全部 done/5
          out.keyPointVerdicts = out.keyPointVerdicts.map((v) =>
            v.ref === "k5"
              ? v
              : {
                  ...v,
                  verdict: "done" as const,
                  quality: 5,
                  rewrite: null,
                  evidence:
                    v.ref === "k1" || v.ref === "k2"
                      ? [{ turn: 3, quote: "需要满足什么条件才能考虑加薪" }]
                      : [{ turn: 1, quote: "我想和您约个时间聊聊" }],
                },
          );
        }),
      });
      expect(dto.scoreBreakdown.orderPenalty).toBe(penalty);
      expect(dto.executionScore).toBe(100 - penalty);
      if (penalty > 0) {
        const [s1, s2] = snapshotBody(sessionId).steps;
        expect(dto.scoreBreakdown.orderViolation).toEqual({ earlierStepId: s1.id, laterStepId: s2.id });
      }
    }
  });
});

describe("改判与撤销改判", () => {
  async function setup() {
    const sessionId = await endedDrill();
    const dto = await generateDebrief(sessionId, { database: test.db });
    return { sessionId, dto };
  }

  it("改判后执行分重算；撤销后恢复", async () => {
    const { sessionId, dto } = await setup();
    expect(dto.executionScore).toBe(40);
    const missed = dto.steps[1].keyPoints[0]; // step2 的 missed 要点

    const changed = overrideVerdict(
      missed.id,
      { verdict: "done", quality: 5, reason: "第 2 轮其实已经量化" },
      test.db,
    );
    // step2 = (1 + 0) / 2 = 0.5；base = (0.8 + 0.5) / 2 = 65
    expect(changed.executionScore).toBe(65);
    expect(changed.verdict).toMatchObject({
      verdict: "missed",
      effectiveVerdict: "done",
      effectiveQuality: 5,
      override: { verdict: "done", quality: 5, reason: "第 2 轮其实已经量化" },
    });
    expect(getDebrief(sessionId, test.db).executionScore).toBe(65);
    expect(rowsOf(sessionId).debrief.executionScore).toBe(65);

    const cleared = clearOverride(missed.id, test.db);
    expect(cleared.executionScore).toBe(40);
    expect(cleared.verdict.override).toBeNull();
    expect(cleared.verdict.effectiveVerdict).toBe("missed");
    expect(getDebrief(sessionId, test.db).executionScore).toBe(40);
  });

  it("把 done 改判为 partial/missed 会降低分数", async () => {
    const { dto } = await setup();
    const done = dto.steps[0].keyPoints[0];
    expect(overrideVerdict(done.id, { verdict: "partial", quality: 2, reason: "不够具体" }, test.db).executionScore).toBe(
      // step1 = (0.4 + 0.8) / 2 = 0.6；base = (0.6 + 0) / 2 = 30
      30,
    );
    expect(overrideVerdict(done.id, { verdict: "missed", quality: null, reason: "没做到" }, test.db).executionScore).toBe(
      20,
    );
  });

  it("原则改判为违反 → 扣 10 分", async () => {
    const { dto } = await setup();
    const result = overrideVerdict(dto.principles[0].id, { verdict: "violated", quality: null, reason: "有威胁" }, test.db);
    expect(result.executionScore).toBe(30);
    expect(result.scoreBreakdown.violatedPrincipleIds).toHaveLength(1);
  });

  it("把条件步骤要点改判为 missed：该步骤计入分母", async () => {
    const { dto } = await setup();
    const conditional = dto.steps[2].keyPoints[0];
    const result = overrideVerdict(conditional.id, { verdict: "missed", quality: null, reason: "对方拒绝了却没追问" }, test.db);
    // base = (0.8 + 0 + 0) / 3 = 26.7
    expect(result.executionScore).toBe(27);
    expect(result.scoreBreakdown.steps[2].included).toBe(true);
  });

  it("入参不合规返回 400", async () => {
    const { dto } = await setup();
    const kp = dto.steps[0].keyPoints[0];
    const principle = dto.principles[0];
    const cases: [string, Parameters<typeof overrideVerdict>[1]][] = [
      [kp.id, { verdict: "done", quality: 2, reason: "r" }],
      [kp.id, { verdict: "done", quality: null, reason: "r" }],
      [kp.id, { verdict: "partial", quality: 4, reason: "r" }],
      [kp.id, { verdict: "missed", quality: 3, reason: "r" }],
      [kp.id, { verdict: "not_triggered", quality: null, reason: "r" }], // 非条件步骤
      [kp.id, { verdict: "kept", quality: null, reason: "r" }],
      [principle.id, { verdict: "done", quality: 4, reason: "r" }],
      [principle.id, { verdict: "kept", quality: 3, reason: "r" }],
    ];
    for (const [id, input] of cases) await expectApiError(() => overrideVerdict(id, input, test.db), 400);
    // 失败的改判不应留下痕迹
    expect(getDebrief(dto.sessionId, test.db).executionScore).toBe(40);
  });

  it("理由必填", () => {
    expect(OverrideInput.safeParse({ verdict: "done", quality: 4, reason: "  " }).success).toBe(false);
    expect(OverrideInput.safeParse({ verdict: "done", quality: 4 }).success).toBe(false);
    expect(OverrideInput.safeParse({ verdict: "missed", reason: "理由" })).toMatchObject({
      success: true,
      data: { quality: null },
    });
  });

  it("不存在的判定 404；没有改判就撤销 409", async () => {
    const { dto } = await setup();
    await expectApiError(() => overrideVerdict("nope", { verdict: "done", quality: 4, reason: "r" }, test.db), 404);
    await expectApiError(() => clearOverride("nope", test.db), 404);
    await expectApiError(() => clearOverride(dto.steps[0].keyPoints[0].id, test.db), 409);
  });
});

describe("综合测验复盘", () => {
  it.each([
    ["target", "correct"],
    ["alternative", "partial"],
    ["other", "wrong"],
  ] as const)("选择%s → 识别 %s", async (pick, expected) => {
    const { sessionId } = await endedQuiz(pick);
    const dto = await generateDebrief(sessionId, { database: test.db });
    expect(dto.recognition?.result).toBe(expected);
    expect(dto.recognition?.explanation).not.toBe("");
    expect(rowsOf(sessionId).debrief.recognition).toBe(expected);
  });

  it("执行按所选方法论评判", async () => {
    const { sessionId } = await endedQuiz("other");
    const dto = await generateDebrief(sessionId, { database: test.db });
    const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(dto.selected.methodologyId).toBe(session.selectedMethodologyId);
    expect(dto.selected.methodologyId).not.toBe(session.targetSnapshot!.methodologyId);
  });

  it("复盘前看不到隐藏字段，复盘后 GET 会话能看到", async () => {
    const { sessionId } = await endedQuiz("target");
    const before = JSON.stringify(getSession(sessionId, test.db));
    for (const key of ["targetMethodologyId", "alternatives", "designNotes", "brief"]) {
      expect(before).not.toContain(`"${key}"`);
    }

    await generateDebrief(sessionId, { database: test.db });
    const after = getSession(sessionId, test.db);
    expect(after.status).toBe("debriefed");
    expect(after.targetMethodologyId).toBeDefined();
    expect(after.targetMethodologyName).toBeTruthy();
    expect(after.brief).toBeDefined();
    expect(after.designNotes).toBeTruthy();
    expect(after.alternatives).toHaveLength(1);
    expect(after.messages.some((m) => m.meta !== undefined)).toBe(true);
  });

  it("复盘 DTO 包含识别信息、对话与场景设计说明", async () => {
    const { sessionId } = await endedQuiz("alternative");
    const dto = await generateDebrief(sessionId, { database: test.db });
    expect(dto.recognition?.alternatives).toHaveLength(1);
    expect(dto.recognition?.designNotes).toBeTruthy();
    expect(dto.recognition?.target.id).not.toBe(dto.recognition?.selected.id);
    expect(dto.session.messages.length).toBeGreaterThan(USER_LINES.length);
  });

  it("阻力触发记录与转录被传给复盘任务", async () => {
    const { sessionId } = await endedQuiz("target");
    let seen: DebriefInput | undefined;
    await generateDebrief(sessionId, {
      database: test.db,
      debrief: async (input) => {
        seen = input;
        return debriefTask.fake(input);
      },
    });
    expect(seen?.userTurnCount).toBe(USER_LINES.length);
    expect(seen?.transcript).toContain("[第1轮·你]");
    expect(seen?.transcript.split("\n")[0]).toMatch(/^\[第0轮·对方\]/);
    expect(seen?.firedResistance[0]).toMatchObject({ id: "r1", turns: [1] });
    expect(seen?.recognition?.result).toBe("correct");
  });
});

describe("消息顺序", () => {
  it("复盘不改动对话", async () => {
    const sessionId = await endedDrill();
    const before = test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.seq)).all();
    await generateDebrief(sessionId, { database: test.db });
    const after = test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.seq)).all();
    expect(after).toEqual(before);
  });
});
