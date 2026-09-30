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
  sources,
  tags,
  type MethodologyStatus,
} from "@/server/db/schema";
import type { CreatePracticeInput } from "@/server/dto/session";
import { ApiError } from "@/server/http";
import { createPractice, getSession, requestHint, startSession } from "@/server/services/practice";
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
  test.db.delete(sources).run();
});

function addSource(id: string): string {
  const now = Date.now();
  test.db
    .insert(sources)
    .values({
      id,
      title: "测试资料",
      author: null,
      format: "txt",
      originalFilename: "sample.txt",
      filePath: "/tmp/sample.txt",
      charCount: 100,
      status: "extracted",
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

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
    sourceId: string | null;
  }> = {},
): string {
  const id = overrides.id ?? nanoid();
  const now = Date.now();
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: overrides.sourceId ?? null,
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

const emptyScope = { tagIds: [], sourceIds: [] };

function pickParams(methodologyId: string, overrides: Partial<CreatePracticeInput> = {}): CreatePracticeInput {
  return { selection: "pick", methodologyId, scope: emptyScope, difficulty: "neutral", ...overrides };
}

function randomParams(overrides: Partial<CreatePracticeInput> = {}): CreatePracticeInput {
  return { selection: "random", scope: emptyScope, difficulty: "neutral", ...overrides };
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

function getScenarioId(sessionId: string): string {
  return test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!.scenarioId;
}

describe("创建练习", () => {
  it("指定：写入场景与 briefing 会话，目标 = 所选方法论", async () => {
    const id = addMethodology({ name: "向领导提加薪", version: 3 });
    addMethodology({ name: "拒绝额外工作请求" });
    savePracticeSettings({ maxTurns: 8 }, test.db);

    const { sessionId } = await createPractice(pickParams(id, { difficulty: "tough" }), { database: test.db });

    const session = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(session).toMatchObject({
      status: "briefing",
      maxTurns: 8,
      hintUsed: false,
      targetSnapshot: null,
    });
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get()!;
    expect(scenario).toMatchObject({
      targetMethodologyId: id,
      targetVersion: 3,
      difficulty: "tough",
      scope: emptyScope,
      promptVersion: "scenario@2",
    });
    // 阻力分配 r1..rn，条件步骤引用映射回真实 ID
    const body = test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!.body;
    const conditionalId = body.steps.find((s) => s.conditional)!.id;
    expect(scenario.brief.plannedResistance.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(scenario.brief.plannedResistance[0].linkedStepId).toBe(conditionalId);
    expect(scenario.brief.plannedResistance.filter((r) => r.linkedStepId !== null)).toHaveLength(1);
  });

  it("随机：在范围内均匀抽取，并把范围写入场景", async () => {
    const work = tagId("职场");
    const a = addMethodology({ name: "A", tagNames: ["职场"] });
    addMethodology({ name: "B", tagNames: ["亲密关系"] });

    const first = await createPractice(randomParams({ scope: { ...emptyScope, tagIds: [work] } }), {
      database: test.db,
      rng: () => 0,
    });
    expect(getSession(first.sessionId, test.db).targetMethodologyId).toBe(a);

    const second = await createPractice(randomParams({ scope: { ...emptyScope, tagIds: [work] } }), {
      database: test.db,
      rng: () => 0.99,
    });
    expect(getSession(second.sessionId, test.db).targetMethodologyId).toBe(a);

    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(first.sessionId))).get()!;
    expect(scenario.scope).toEqual({ tagIds: [work], sourceIds: [] });
  });

  it("随机：rng 落在不同区间抽到不同方法论；范围为空时报错", async () => {
    const a = addMethodology({ name: "A" });
    const b = addMethodology({ name: "B" });

    const first = await createPractice(randomParams(), { database: test.db, rng: () => 0 });
    const second = await createPractice(randomParams(), { database: test.db, rng: () => 0.99 });
    expect([getSession(first.sessionId, test.db).targetMethodologyId, getSession(second.sessionId, test.db).targetMethodologyId]).toEqual(
      [a, b],
    );

    await expectApiError(
      createPractice(randomParams({ scope: { ...emptyScope, tagIds: [tagId("空标签")] } }), { database: test.db }),
      400,
    );
  });

  it("筛选取交集：标签全中且资料命中", async () => {
    const work = tagId("职场");
    const s1 = addSource("s1");
    addSource("s2");
    const both = addMethodology({ name: "A", tagNames: ["职场", "沟通"], sourceId: s1 });
    addMethodology({ name: "B", tagNames: ["职场"], sourceId: "s2" });

    const byTags = await createPractice(randomParams({ scope: { tagIds: [work, tagId("沟通")], sourceIds: [] } }), {
      database: test.db,
      rng: () => 0,
    });
    expect(getSession(byTags.sessionId, test.db).targetMethodologyId).toBe(both);

    const bySource = await createPractice(randomParams({ scope: { tagIds: [work], sourceIds: [s1] } }), {
      database: test.db,
      rng: () => 0,
    });
    expect(getSession(bySource.sessionId, test.db).targetMethodologyId).toBe(both);
  });

  it("recentTitles 生效：同一目标方法论的第 2 个场景标题不同", async () => {
    const id = addMethodology();
    const first = await createPractice(pickParams(id), { database: test.db });
    const second = await createPractice(pickParams(id), { database: test.db });
    expect(getSession(first.sessionId, test.db).scenario.title).toBe("示例场景 1");
    expect(getSession(second.sessionId, test.db).scenario.title).toBe("示例场景 2");
  });

  describe("选题校验", () => {
    it("指定必须给出已确认的方法论", async () => {
      addMethodology();
      await expectApiError(createPractice({ selection: "pick", scope: emptyScope, difficulty: "neutral" }, { database: test.db }), 400);
      await expectApiError(createPractice(pickParams("不存在"), { database: test.db }), 400);
      const draft = addMethodology({ status: "draft" });
      await expectApiError(createPractice(pickParams(draft), { database: test.db }), 400);
    });

    it("随机范围内没有已确认方法论时报错", async () => {
      addMethodology({ status: "draft" });
      const message = await expectApiError(createPractice(randomParams(), { database: test.db }), 400);
      expect(message).toContain("没有已确认的方法论");
    });

    it("校验失败不会留下场景或会话", async () => {
      await expectApiError(createPractice(randomParams(), { database: test.db }), 400);
      expect(test.db.select().from(scenarios).all()).toHaveLength(0);
      expect(test.db.select().from(practiceSessions).all()).toHaveLength(0);
    });
  });
});

describe("开始练习", () => {
  it("写入目标方法论快照，并把开场白插入为第 0 轮", async () => {
    const id = addMethodology({ name: "A", version: 2, tagNames: ["职场"] });
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    const scenarioRow = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(sessionId))).get()!;

    const dto = startSession(sessionId, test.db);
    expect(dto.status).toBe("active");
    expect(dto.startedAt).not.toBeNull();

    const row = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    const body = test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!.body;
    expect(row.targetSnapshot).toEqual({
      methodologyId: id,
      version: 2,
      name: "A",
      tags: ["职场"],
      body,
    });

    const msgs = test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "counterpart", turn: 0, seq: 1, content: scenarioRow.openingLine });
  });

  it("对方不先开口时不插入开场白", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    test.db
      .update(scenarios)
      .set({ openingSpeaker: "user", openingLine: null })
      .where(eq(scenarios.id, getScenarioId(sessionId)))
      .run();
    startSession(sessionId, test.db);
    expect(test.db.select().from(messages).where(eq(messages.sessionId, sessionId)).all()).toHaveLength(0);
  });

  it("开始后修改方法论不影响快照；快照同时用于提示", async () => {
    const id = addMethodology({ name: "原名" });
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    startSession(sessionId, test.db);
    test.db.update(methodologies).set({ name: "新名", version: 2 }).where(eq(methodologies.id, id)).run();
    const row = test.db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()!;
    expect(row.targetSnapshot).toMatchObject({ name: "原名", version: 1 });
    expect(requestHint(sessionId, test.db).name).toBe("原名");
  });

  it("重复开始返回 409；所需方法论已不是已确认状态时返回 409", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
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
  it("记录 hintUsed，返回骨架（不含原文摘录）", async () => {
    const id = addMethodology({ name: "向领导提加薪" });
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    expect(getSession(sessionId, test.db).hintUsed).toBe(false);
    const skeleton = requestHint(sessionId, test.db);
    expect(skeleton.name).toBe("向领导提加薪");
    expect(skeleton.steps.map((s) => s.title)).toEqual(["预约合适的时机", "用数据陈述贡献", "对方拒绝时追问条件"]);
    expect(skeleton.steps[2]).toMatchObject({ conditional: true, trigger: "对方以预算为由拒绝" });
    expect(JSON.stringify(skeleton)).not.toContain("excerpt");
    expect(getSession(sessionId, test.db).hintUsed).toBe(true);
  });

  it("已结束的练习不能再查看", async () => {
    const id = addMethodology();
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    test.db.update(practiceSessions).set({ status: "ended" }).where(eq(practiceSessions.id, sessionId)).run();
    await expectApiError(() => requestHint(sessionId, test.db), 409);
    await expectApiError(() => requestHint("不存在", test.db), 404);
  });
});

describe("会话 DTO 的隐藏字段", () => {
  function assertNoHidden(json: string, scenario: typeof scenarios.$inferSelect) {
    for (const key of ["brief", "designNotes", "targetSkeleton", "meta", "targetSnapshot"]) {
      expect(json).not.toContain(`"${key}"`);
    }
    const brief = scenario.brief;
    const briefValues = [
      brief.personality,
      brief.trueStance,
      brief.yieldConditions,
      brief.breakdownConditions,
      ...brief.hiddenConcerns,
      ...brief.plannedResistance.flatMap((r) => [r.trigger, r.reaction]),
      scenario.designNotes,
    ];
    for (const value of briefValues) expect(json).not.toContain(value);
    for (const resistance of brief.plannedResistance) {
      expect(json).not.toContain(`"${resistance.id}"`);
    }
  }

  async function setup() {
    const id = addMethodology({
      name: "向领导提加薪",
      tagNames: ["职场"],
      body: makeMethodologyBody({ summary: "摘要独有文字", steps: [makeStep({ title: "步骤独有标题" })] }),
    });
    const { sessionId } = await createPractice(pickParams(id), { database: test.db });
    const scenario = test.db.select().from(scenarios).where(eq(scenarios.id, getScenarioId(sessionId))).get()!;
    return { sessionId, scenario, id };
  }

  it("briefing：下发目标方法论名称与骨架之外的可见内容，其余隐藏", async () => {
    const { sessionId, scenario, id } = await setup();
    const dto = getSession(sessionId, test.db);
    const json = JSON.stringify(dto);

    assertNoHidden(json, scenario);
    expect(dto.targetMethodologyId).toBe(id);
    expect(dto.targetMethodologyName).toBe("向领导提加薪");
    expect(json).not.toContain("摘要独有文字");
    expect(dto.scenario).toMatchObject({ title: scenario.title, userRole: scenario.userRole });
  });

  it("active / ended：仍不下发角色卡与消息 meta", async () => {
    const { sessionId, scenario } = await setup();
    startSession(sessionId, test.db);
    test.db
      .update(messages)
      .set({ meta: { firedResistanceIds: ["r1"], end: { type: "agreed", note: "对方答应了" } } })
      .where(eq(messages.sessionId, sessionId))
      .run();

    for (const status of ["active", "ended"] as const) {
      test.db.update(practiceSessions).set({ status }).where(eq(practiceSessions.id, sessionId)).run();
      const json = JSON.stringify(getSession(sessionId, test.db));
      assertNoHidden(json, scenario);
      expect(json).not.toContain("对方答应了");
    }
  });

  it("复盘后（debriefed / debrief_failed）才下发角色卡、设计说明、骨架与 meta", async () => {
    const { sessionId, scenario } = await setup();
    startSession(sessionId, test.db);
    test.db
      .update(messages)
      .set({ meta: { firedResistanceIds: ["r1"], end: null } })
      .where(eq(messages.sessionId, sessionId))
      .run();
    test.db.update(practiceSessions).set({ status: "debriefed" }).where(eq(practiceSessions.id, sessionId)).run();

    const dto = getSession(sessionId, test.db);
    expect(dto.designNotes).toBe(scenario.designNotes);
    expect(dto.brief).toEqual(scenario.brief);
    expect(dto.targetSkeleton?.name).toBe(dto.targetMethodologyName);
    expect(dto.messages[0].meta).toEqual({ firedResistanceIds: ["r1"], end: null });

    test.db
      .update(practiceSessions)
      .set({ status: "debrief_failed" })
      .where(eq(practiceSessions.id, sessionId))
      .run();
    expect(getSession(sessionId, test.db).designNotes).toBe(scenario.designNotes);
  });
});
