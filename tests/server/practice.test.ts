import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MethodologyBody } from "@/domain/schemas";
import {
  debriefs,
  messages,
  methodologies,
  methodologyTags,
  practiceSessions,
  scenarios,
  settings,
  tags,
  type MethodologyStatus,
} from "@/server/db/schema";
import type { CreatePracticeInput } from "@/server/dto/session";
import { ApiError } from "@/server/http";
import {
  createPractice,
  getSession,
  requestHint,
  selectMethodology,
  startSession,
} from "@/server/services/practice";
import { savePracticeSettings } from "@/server/llm/settings";

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

function tagId(name: string): string {
  const existing = test.db.select().from(tags).where(eq(tags.name, name)).get();
  if (existing) return existing.id;
  const id = nanoid();
  test.db.insert(tags).values({ id, name }).run();
  return id;
}

function bodyWithConditional(): MethodologyBody {
  return makeMethodologyBody({
    orderMode: "strict",
    steps: [
      makeStep({ title: "预约合适的时机" }),
      makeStep({ title: "用数据陈述贡献", keyPoints: [makeKeyPoint("列出具体成果")] }),
      makeStep({ title: "对方拒绝时追问条件", conditional: true, trigger: "对方以预算为由拒绝" }),
    ],
  });
}

function addMethodology(
  overrides: Partial<{
    id: string;
    name: string;
    status: MethodologyStatus;
    body: MethodologyBody;
    version: number;
    tagNames: string[];
  }> = {},
): string {
  const id = overrides.id ?? nanoid();
  const now = Date.now();
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: null,
      status: overrides.status ?? "confirmed",
      name: overrides.name ?? "方法甲",
      body: overrides.body ?? bodyWithConditional(),
      originChunkIds: [],
      createdBy: "seed",
      version: overrides.version ?? 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
    })
    .run();
  for (const name of overrides.tagNames ?? []) {
    test.db.insert(methodologyTags).values({ methodologyId: id, tagId: tagId(name) }).run();
  }
  return id;
}

const emptyScope = { tagIds: [], sourceIds: [], methodologyIds: [] };

function quizParams(overrides: Partial<CreatePracticeInput> = {}): CreatePracticeInput {
  return {
    mode: "quiz",
    selection: "random",
    scope: emptyScope,
    difficulty: "neutral",
    ...overrides,
  };
}

async function expectApiError(promise: Promise<unknown> | (() => unknown), status: number) {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return (err as ApiError).message;
  }
  throw new Error(`期望抛出 ${status} 错误，但没有抛出`);
}

function addDebriefedSession(params: {
  targetId: string;
  selectedId: string;
  mode?: "drill" | "quiz";
  executionScore: number;
  recognition?: "correct" | "partial" | "wrong" | null;
  endedAt: number;
}) {
  const scenarioId = nanoid();
  test.db
    .insert(scenarios)
    .values({
      id: scenarioId,
      targetMethodologyId: params.targetId,
      targetVersion: 1,
      difficulty: "neutral",
      scope: emptyScope,
      candidateIds: [params.targetId],
      title: "旧场景",
      background: "b",
      userRole: "r",
      userGoal: "g",
      counterpartName: "n",
      counterpartRelation: "r",
      counterpartProfile: "p",
      openingSpeaker: "user",
      openingLine: null,
      brief: {
        personality: "",
        trueStance: "",
        hiddenConcerns: [],
        plannedResistance: [],
        yieldConditions: "",
        breakdownConditions: "",
      },
      alternatives: [],
      designNotes: "",
      promptVersion: "scenario@1",
      createdAt: params.endedAt,
    })
    .run();
  const sessionId = nanoid();
  test.db
    .insert(practiceSessions)
    .values({
      id: sessionId,
      scenarioId,
      mode: params.mode ?? "drill",
      status: "debriefed",
      selectedMethodologyId: params.selectedId,
      hintUsed: false,
      maxTurns: 12,
      endReason: "user",
      createdAt: params.endedAt,
      startedAt: params.endedAt,
      endedAt: params.endedAt,
    })
    .run();
  test.db
    .insert(debriefs)
    .values({
      id: nanoid(),
      sessionId,
      recognition: params.recognition ?? null,
      recognitionExplanation: null,
      executionScore: params.executionScore,
      scoreBreakdown: {
        base: params.executionScore,
        steps: [],
        principlePenalty: 0,
        violatedPrincipleIds: [],
        orderPenalty: 0,
        orderViolation: null,
        executionScore: params.executionScore,
      },
      holisticScore: 70,
      holisticComment: "",
      outcome: "unresolved",
      outcomeNote: "",
      summary: { strengths: [], improvements: [] },
      promptVersion: "debrief@1",
      createdAt: params.endedAt,
      updatedAt: params.endedAt,
    })
    .run();
}

describe("创建练习", () => {
  it("专项练习（指定）：写入场景与 briefing 会话，目标 = 所选方法论", async () => {
    const id = addMethodology({ name: "向领导提加薪", version: 3 });
    addMethodology({ name: "拒绝额外工作请求" });
    savePracticeSettings({ maxTurns: 8 }, test.db);

    const { sessionId } = await createPractice(
      {
        mode: "drill",
        selection: "pick",
        methodologyId: id,
        scope: emptyScope,
        difficulty: "tough",
      },
      { database: test.db },
    );

    const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(session).toMatchObject({
      mode: "drill",
      status: "briefing",
      selectedMethodologyId: id,
      maxTurns: 8,
      hintUsed: false,
      targetSnapshot: null,
      selectedSnapshot: null,
    });
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get()!;
    expect(scenario).toMatchObject({
      targetMethodologyId: id,
      targetVersion: 3,
      difficulty: "tough",
      candidateIds: [id],
      promptVersion: "scenario@1",
    });
    // 阻力分配 r1..rn，条件步骤引用映射回真实 ID
    const body = test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!.body;
    const conditionalId = body.steps.find((s) => s.conditional)!.id;
    expect(scenario.brief.plannedResistance.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(scenario.brief.plannedResistance[0].linkedStepId).toBe(conditionalId);
    expect(scenario.brief.plannedResistance.filter((r) => r.linkedStepId !== null)).toHaveLength(1);
  });

  it("专项练习（随机）：目标来自范围；scope 与候选列表按规则写入", async () => {
    const work = tagId("职场");
    const a = addMethodology({ name: "A", tagNames: ["职场"] });
    addMethodology({ name: "B", tagNames: ["亲密关系"] });

    const { sessionId } = await createPractice(
      { mode: "drill", selection: "random", scope: { ...emptyScope, tagIds: [work] }, difficulty: "neutral" },
      { database: test.db },
    );
    const dto = getSession(sessionId, test.db);
    expect(dto.targetMethodologyId).toBe(a);
    expect(dto.selectedMethodologyId).toBe(a);
    expect(dto.candidates).toBeUndefined();
  });

  it("综合测验：候选 = 范围内全部已确认方法论，备选映射为真实 ID", async () => {
    const a = addMethodology({ name: "A" });
    const b = addMethodology({ name: "B" });
    addMethodology({ name: "C", status: "draft" });
    addMethodology({ name: "D", status: "archived" });

    const { sessionId } = await createPractice(quizParams(), { database: test.db });
    const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get()!;
    expect([...scenario.candidateIds].sort()).toEqual([a, b].sort());
    expect(session.selectedMethodologyId).toBeNull();
    const other = scenario.targetMethodologyId === a ? b : a;
    expect(scenario.alternatives).toEqual([
      { methodologyId: other, reason: expect.any(String) },
    ]);
  });

  it("随机选题按掌握度加权：练得好的方法论更少被抽到", async () => {
    const a = addMethodology({ name: "A" });
    const b = addMethodology({ name: "B" });
    const now = Date.now();
    addDebriefedSession({ targetId: a, selectedId: a, executionScore: 100, endedAt: now });

    // 权重 A = 0.1（掌握度 1），B = 1.1；rng=0.5 时阈值 0.6，越过 A 后落在 B
    const { sessionId } = await createPractice(quizParams(), {
      database: test.db,
      rng: () => 0.5,
      now,
    });
    expect(
      test.db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, getScenarioId(sessionId)))
        .get()!.targetMethodologyId,
    ).toBe(b);

    // rng=0 落在第一个区间（A）
    const second = await createPractice(quizParams(), { database: test.db, rng: () => 0, now });
    expect(
      test.db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, getScenarioId(second.sessionId)))
        .get()!.targetMethodologyId,
    ).toBe(a);
  });

  it("recentTitles 生效：同一目标方法论的第 2 个场景标题不同", async () => {
    const id = addMethodology();
    const params: CreatePracticeInput = {
      mode: "drill",
      selection: "pick",
      methodologyId: id,
      scope: emptyScope,
      difficulty: "neutral",
    };
    const first = await createPractice(params, { database: test.db });
    const second = await createPractice(params, { database: test.db });
    expect(getSession(first.sessionId, test.db).scenario.title).toBe("示例场景 1");
    expect(getSession(second.sessionId, test.db).scenario.title).toBe("示例场景 2");
  });

  describe("选题校验", () => {
    it("专项练习（指定）必须指定已确认的方法论", async () => {
      addMethodology();
      const base: CreatePracticeInput = {
        mode: "drill",
        selection: "pick",
        scope: emptyScope,
        difficulty: "neutral",
      };
      await expectApiError(createPractice(base, { database: test.db }), 400);
      await expectApiError(
        createPractice({ ...base, methodologyId: "不存在" }, { database: test.db }),
        400,
      );
      const draft = addMethodology({ status: "draft" });
      await expectApiError(
        createPractice({ ...base, methodologyId: draft }, { database: test.db }),
        400,
      );
    });

    it("专项练习（随机）范围内没有已确认方法论时报错", async () => {
      addMethodology({ status: "draft" });
      const message = await expectApiError(
        createPractice(
          { mode: "drill", selection: "random", scope: emptyScope, difficulty: "neutral" },
          { database: test.db },
        ),
        400,
      );
      expect(message).toContain("没有已确认的方法论");
    });

    it("综合测验范围内不足 2 个已确认方法论时报错", async () => {
      const a = addMethodology({ name: "A" });
      addMethodology({ name: "B" });
      addMethodology({ name: "C", status: "draft" });
      const message = await expectApiError(
        createPractice(
          quizParams({ scope: { ...emptyScope, methodologyIds: [a] } }),
          { database: test.db },
        ),
        400,
      );
      expect(message).toContain("至少需要 2 个");
      // 只有草稿的范围同样不够
      await expectApiError(
        createPractice(
          quizParams({ scope: { ...emptyScope, tagIds: [tagId("空标签")] } }),
          { database: test.db },
        ),
        400,
      );
    });

    it("校验失败不会留下场景或会话", async () => {
      await expectApiError(createPractice(quizParams(), { database: test.db }), 400);
      expect(test.db.select().from(scenarios).all()).toHaveLength(0);
      expect(test.db.select().from(practiceSessions).all()).toHaveLength(0);
    });
  });
});

function getScenarioId(sessionId: string): string {
  return test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!.scenarioId;
}

describe("选择方法论（综合测验）", () => {
  async function newQuiz() {
    const a = addMethodology({ name: "A" });
    const b = addMethodology({ name: "B" });
    const c = addMethodology({ name: "C" });
    const { sessionId } = await createPractice(
      quizParams({ scope: { ...emptyScope, methodologyIds: [a, b] } }),
      { database: test.db },
    );
    return { a, b, c, sessionId };
  }

  it("可多次修改，必须在候选列表中", async () => {
    const { a, b, c, sessionId } = await newQuiz();
    expect(selectMethodology(sessionId, a, test.db).selectedMethodologyId).toBe(a);
    expect(selectMethodology(sessionId, b, test.db).selectedMethodologyId).toBe(b);
    await expectApiError(() => selectMethodology(sessionId, c, test.db), 400);
    expect(getSession(sessionId, test.db).selectedMethodologyId).toBe(b);
  });

  it("专项练习不能选择；开始后不能再改", async () => {
    const { a, sessionId } = await newQuiz();
    const drill = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    await expectApiError(() => selectMethodology(drill.sessionId, a, test.db), 409);

    selectMethodology(sessionId, a, test.db);
    startSession(sessionId, test.db);
    await expectApiError(() => selectMethodology(sessionId, a, test.db), 409);
  });
});

describe("开始练习", () => {
  it("综合测验未选择方法论时返回 409", async () => {
    addMethodology({ name: "A" });
    addMethodology({ name: "B" });
    const { sessionId } = await createPractice(quizParams(), { database: test.db });
    await expectApiError(() => startSession(sessionId, test.db), 409);
    expect(getSession(sessionId, test.db).status).toBe("briefing");
  });

  it("写入目标与所选方法论的快照，并把开场白插入为第 0 轮", async () => {
    const a = addMethodology({ name: "A", version: 2, tagNames: ["职场"] });
    const b = addMethodology({ name: "B", version: 5, tagNames: ["亲密关系", "家庭"] });
    const { sessionId } = await createPractice(
      quizParams({ scope: { ...emptyScope, methodologyIds: [a, b] } }),
      { database: test.db },
    );
    const scenarioRow = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(sessionId))).get()!;
    const targetId = scenarioRow.targetMethodologyId;
    const otherId = targetId === a ? b : a;
    selectMethodology(sessionId, otherId, test.db);

    const dto = startSession(sessionId, test.db);
    expect(dto.status).toBe("active");
    expect(dto.startedAt).not.toBeNull();

    const row = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    const bodyOf = (id: string) => test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!.body;
    expect(row.targetSnapshot).toEqual({
      methodologyId: targetId,
      version: targetId === a ? 2 : 5,
      name: targetId === a ? "A" : "B",
      tags: targetId === a ? ["职场"] : ["亲密关系", "家庭"],
      body: bodyOf(targetId),
    });
    expect(row.selectedSnapshot).toMatchObject({
      methodologyId: otherId,
      version: otherId === a ? 2 : 5,
      body: bodyOf(otherId),
    });

    const msgs = test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "counterpart", turn: 0, seq: 1, content: scenarioRow.openingLine });
  });

  it("专项练习：所选 = 目标，两份快照内容一致", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "cooperative" },
      { database: test.db },
    );
    startSession(sessionId, test.db);
    const row = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(row.targetSnapshot).not.toBeNull();
    expect(row.selectedSnapshot).toEqual(row.targetSnapshot);
  });

  it("对方不先开口时不插入开场白", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    test.db
      .update(scenarios)
      .set({ openingSpeaker: "user", openingLine: null })
      .where(eq(scenarios.id, getScenarioId(sessionId)))
      .run();
    startSession(sessionId, test.db);
    expect(test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).all()).toHaveLength(0);
  });

  it("开始后修改方法论不影响快照", async () => {
    const id = addMethodology({ name: "原名" });
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    startSession(sessionId, test.db);
    test.db.update(methodologies).set({ name: "新名", version: 2 }).where(eq(methodologies.id, id)).run();
    const row = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(row.targetSnapshot).toMatchObject({ name: "原名", version: 1 });
  });

  it("重复开始返回 409；所需方法论已不是已确认状态时返回 409", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    test.db.update(methodologies).set({ status: "archived" }).where(eq(methodologies.id, id)).run();
    await expectApiError(() => startSession(sessionId, test.db), 409);
    expect(getSession(sessionId, test.db).status).toBe("briefing");

    test.db.update(methodologies).set({ status: "confirmed" }).where(eq(methodologies.id, id)).run();
    startSession(sessionId, test.db);
    await expectApiError(() => startSession(sessionId, test.db), 409);
    await expectApiError(() => startSession("不存在", test.db), 404);
  });
});

describe("查看提示", () => {
  it("专项练习：记录 hintUsed，返回骨架（不含原文摘录）", async () => {
    const id = addMethodology({ name: "向领导提加薪" });
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    expect(getSession(sessionId, test.db).hintUsed).toBe(false);
    const skeleton = requestHint(sessionId, test.db);
    expect(skeleton.name).toBe("向领导提加薪");
    expect(skeleton.steps.map((s) => s.title)).toEqual(["预约合适的时机", "用数据陈述贡献", "对方拒绝时追问条件"]);
    expect(skeleton.steps[2]).toMatchObject({ conditional: true, trigger: "对方以预算为由拒绝" });
    expect(JSON.stringify(skeleton)).not.toContain("excerpt");
    expect(getSession(sessionId, test.db).hintUsed).toBe(true);
  });

  it("开始后返回快照内容", async () => {
    const id = addMethodology({ name: "原名" });
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    startSession(sessionId, test.db);
    test.db.update(methodologies).set({ name: "新名" }).where(eq(methodologies.id, id)).run();
    expect(requestHint(sessionId, test.db).name).toBe("原名");
  });

  it("综合测验不提供提示；已结束的练习不能再查看", async () => {
    addMethodology({ name: "A" });
    addMethodology({ name: "B" });
    const quiz = await createPractice(quizParams(), { database: test.db });
    await expectApiError(() => requestHint(quiz.sessionId, test.db), 409);
    expect(getSession(quiz.sessionId, test.db).hintUsed).toBe(false);

    const id = addMethodology({ name: "C" });
    const drill = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    test.db.update(practiceSessions).set({ status: "ended" }).where(eq(practiceSessions.id, drill.sessionId)).run();
    await expectApiError(() => requestHint(drill.sessionId, test.db), 409);
  });
});

describe("会话 DTO 不泄露隐藏字段（data-model.md §4）", () => {
  const HIDDEN_KEYS = ["targetMethodologyId", "targetMethodologyName", "targetVersion", "alternatives", "designNotes", "brief", "meta", "targetSnapshot", "selectedSnapshot", "candidateIds", "scope"];

  async function setupQuiz() {
    const a = addMethodology({
      name: "向领导提加薪",
      tagNames: ["职场"],
      body: makeMethodologyBody({
        summary: "摘要甲独有文字",
        goal: "目标甲独有文字",
        steps: [makeStep({ title: "步骤甲独有标题", conditional: false })],
      }),
    });
    const b = addMethodology({
      name: "先共情再建议的安慰法",
      tagNames: ["亲密关系"],
      body: makeMethodologyBody({ summary: "摘要乙独有文字", goal: "目标乙独有文字" }),
    });
    const c = addMethodology({ name: "拒绝额外工作请求", tagNames: ["职场"] });
    const { sessionId } = await createPractice(
      quizParams({ scope: { ...emptyScope, methodologyIds: [a, b, c] } }),
      { database: test.db },
    );
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(sessionId))).get()!;
    return { sessionId, scenario, ids: [a, b, c] };
  }

  function assertNoLeak(json: string, scenario: typeof scenarios.$inferSelect) {
    for (const key of HIDDEN_KEYS) expect(json).not.toContain(`"${key}"`);
    // 角色卡中的任意字段值都不出现在响应里
    const brief = scenario.brief;
    const briefValues = [
      brief.personality,
      brief.trueStance,
      brief.yieldConditions,
      brief.breakdownConditions,
      ...brief.hiddenConcerns,
      ...brief.plannedResistance.flatMap((r) => [r.trigger, r.reaction]),
      scenario.designNotes,
      ...scenario.alternatives.map((alt) => alt.reason),
    ];
    for (const value of briefValues) expect(json).not.toContain(value);
    // 阻力 id 形如 r1/r2，短且可能偶然出现在 nanoid 里，按带引号的 JSON 值比对
    for (const resistance of brief.plannedResistance) {
      expect(json).not.toContain(`"${resistance.id}"`);
    }
  }

  it("综合测验 briefing：无目标/备选/设计说明/角色卡，候选只有 id、名称、标签且按名称排序", async () => {
    const { sessionId, scenario } = await setupQuiz();
    const dto = getSession(sessionId, test.db);
    const json = JSON.stringify(dto);

    assertNoLeak(json, scenario);
    expect(dto.status).toBe("briefing");
    expect(dto.candidates!.map((c) => c.name)).toEqual(
      ["向领导提加薪", "先共情再建议的安慰法", "拒绝额外工作请求"].sort((x, y) => x.localeCompare(y, "zh-CN")),
    );
    for (const candidate of dto.candidates!) {
      expect(Object.keys(candidate).sort()).toEqual(["id", "name", "tags"]);
    }
    expect(dto.candidates!.find((c) => c.name === "向领导提加薪")!.tags).toEqual(["职场"]);
    for (const text of ["摘要甲独有文字", "目标甲独有文字", "步骤甲独有标题", "摘要乙独有文字"]) {
      expect(json).not.toContain(text);
    }
    expect(dto.selectedMethodologyId).toBeNull();
    expect(dto.scenario).toMatchObject({ title: scenario.title, userRole: scenario.userRole });
  });

  it("综合测验 active / ended：仍不泄露，消息不带 meta，也不带快照", async () => {
    const { sessionId, scenario, ids } = await setupQuiz();
    selectMethodology(sessionId, ids[1], test.db);
    startSession(sessionId, test.db);
    // 给开场白补上 meta，确认不会被下发
    test.db
      .update(messages)
      .set({ meta: { firedResistanceIds: ["r1"], end: { type: "agreed", note: "对方答应了" } } })
      .where(eq(messages.sessionId, sessionId))
      .run();

    for (const status of ["active", "ended"] as const) {
      test.db.update(practiceSessions).set({ status }).where(eq(practiceSessions.id, sessionId)).run();
      const dto = getSession(sessionId, test.db);
      const json = JSON.stringify(dto);
      assertNoLeak(json, scenario);
      expect(json).not.toContain("对方答应了");
      expect(dto.messages).toHaveLength(1);
      expect(dto.selectedMethodologyId).toBe(ids[1]);
      expect(dto.candidates).toHaveLength(3);
    }
  });

  it("专项练习 briefing：下发目标名称，但不下发角色卡、设计说明、备选和骨架", async () => {
    const id = addMethodology({ name: "向领导提加薪", body: makeMethodologyBody({ summary: "摘要独有文字" }) });
    const { sessionId } = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: id, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(sessionId))).get()!;
    const dto = getSession(sessionId, test.db);
    const json = JSON.stringify(dto);

    expect(dto.targetMethodologyId).toBe(id);
    expect(dto.targetMethodologyName).toBe("向领导提加薪");
    for (const key of ["alternatives", "designNotes", "brief", "meta", "targetSkeleton", "candidates"]) {
      expect(json).not.toContain(`"${key}"`);
    }
    expect(json).not.toContain("摘要独有文字");
    for (const value of [scenario.brief.personality, scenario.brief.trueStance, scenario.designNotes]) {
      expect(json).not.toContain(value);
    }
  });

  it("复盘后（debriefed）才下发目标、备选、设计说明、角色卡与 meta", async () => {
    const { sessionId, scenario, ids } = await setupQuiz();
    selectMethodology(sessionId, ids[1], test.db);
    startSession(sessionId, test.db);
    test.db
      .update(messages)
      .set({ meta: { firedResistanceIds: ["r1"], end: null } })
      .where(eq(messages.sessionId, sessionId))
      .run();
    test.db.update(practiceSessions).set({ status: "debriefed" }).where(eq(practiceSessions.id, sessionId)).run();

    const dto = getSession(sessionId, test.db);
    expect(dto.targetMethodologyId).toBe(scenario.targetMethodologyId);
    expect(dto.targetMethodologyName).toBeTruthy();
    expect(dto.designNotes).toBe(scenario.designNotes);
    expect(dto.brief).toEqual(scenario.brief);
    expect(dto.alternatives).toEqual(
      scenario.alternatives.map((alt) => ({
        methodologyId: alt.methodologyId,
        name: expect.any(String),
        reason: alt.reason,
      })),
    );
    expect(dto.targetSkeleton?.name).toBe(dto.targetMethodologyName);
    expect(dto.messages[0].meta).toEqual({ firedResistanceIds: ["r1"], end: null });

    test.db.update(practiceSessions).set({ status: "debrief_failed" }).where(eq(practiceSessions.id, sessionId)).run();
    expect(getSession(sessionId, test.db).designNotes).toBe(scenario.designNotes);
  });
});
