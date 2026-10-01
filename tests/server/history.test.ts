import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { HISTORY_PAGE_SIZE } from "@/domain/constants";
import type { MethodologyBody } from "@/domain/schemas";
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
import {
  abandonSession,
  createPractice,
  getSession,
  listSessions,
  retryScenario,
  startSession,
} from "@/server/services/practice";

import { makeMethodologyBody, makeStep } from "../fixtures/methodology";
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

const emptyScope = { tagIds: [], sourceIds: [] };

function addMethodology(name: string): string {
  const id = nanoid();
  const now = Date.now();
  const body: MethodologyBody = makeMethodologyBody({
    steps: [makeStep({ title: "说明来意" })],
  });
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: null,
      status: "confirmed",
      name,
      body,
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

/** 直接插入一个 briefing 会话（用于排序、分页等不需要走场景生成的用例）。 */
function insertSession(params: {
  scenarioId: string;
  status: "briefing" | "active" | "ended" | "debriefed" | "debrief_failed";
  createdAt: number;
}): string {
  const id = nanoid();
  test.db
    .insert(practiceSessions)
    .values({
      id,
      scenarioId: params.scenarioId,
      status: params.status,
      hintUsed: false,
      maxTurns: 12,
      createdAt: params.createdAt,
    })
    .run();
  return id;
}

function insertScenario(targetId: string, title: string): string {
  const id = nanoid();
  test.db
    .insert(scenarios)
    .values({
      id,
      targetMethodologyId: targetId,
      targetVersion: 1,
      difficulty: "neutral",
      scope: emptyScope,
      title,
      background: "背景",
      userRole: "你",
      userGoal: "目标",
      counterpartName: "对方",
      counterpartRelation: "同事",
      counterpartProfile: "简介",
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
      designNotes: "",
      promptVersion: "scenario@2",
      createdAt: Date.now(),
    })
    .run();
  return id;
}

function insertDebrief(
  sessionId: string,
  params: {
    executionScore: number;
    outcome: "agreed" | "partial" | "refused" | "unresolved";
    createdAt: number;
  },
): void {
  test.db
    .insert(debriefs)
    .values({
      id: nanoid(),
      sessionId,
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
      outcome: params.outcome,
      outcomeNote: "",
      summary: { strengths: [], improvements: [] },
      promptVersion: "debrief@2",
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
    })
    .run();
}

describe("历史列表 listSessions", () => {
  it("空库返回空列表", () => {
    expect(listSessions({}, test.db)).toEqual({ items: [], page: 1, pageSize: HISTORY_PAGE_SIZE, total: 0 });
  });

  it("按创建时间倒序、按页大小分页", () => {
    const target = addMethodology("方法甲");
    const scenarioId = insertScenario(target, "场景");
    const base = Date.now();
    const first = insertSession({ scenarioId, status: "briefing", createdAt: base });
    const second = insertSession({ scenarioId, status: "briefing", createdAt: base + 1000 });
    const third = insertSession({ scenarioId, status: "briefing", createdAt: base + 2000 });

    const all = listSessions({}, test.db);
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.id)).toEqual([third, second, first]);

    const page1 = listSessions({ page: 1, pageSize: 2 }, test.db);
    expect(page1.items.map((item) => item.id)).toEqual([third, second]);
    expect(page1.total).toBe(3);

    const page2 = listSessions({ page: 2, pageSize: 2 }, test.db);
    expect(page2.items.map((item) => item.id)).toEqual([first]);
    expect(page2.page).toBe(2);
  });

  it("未复盘时只有目标方法论名称，执行分与说服结果为空", async () => {
    const a = addMethodology("方法甲");
    const practice = await createPractice(
      { selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    startSession(practice.sessionId, test.db);

    const item = listSessions({}, test.db).items.find((row) => row.id === practice.sessionId)!;
    expect(item.methodologyName).toBe("方法甲");
    expect(item.executionScore).toBeNull();
    expect(item.outcome).toBeNull();
    expect(item.status).toBe("active");
  });

  it("复盘后带出目标方法论、执行分与说服结果", async () => {
    const a = addMethodology("方法甲");
    const practice = await createPractice(
      { selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(practice.sessionId, test.db).scenario.id;
    startSession(practice.sessionId, test.db);
    const now = Date.now();
    test.db
      .update(practiceSessions)
      .set({ status: "debriefed", endedAt: now })
      .where(eq(practiceSessions.id, practice.sessionId))
      .run();
    insertDebrief(practice.sessionId, { executionScore: 66, outcome: "agreed", createdAt: now });

    const item = listSessions({}, test.db).items.find((row) => row.id === practice.sessionId)!;
    expect(item.methodologyName).toBe("方法甲");
    expect(item.executionScore).toBe(66);
    expect(item.outcome).toBe("agreed");
    expect(item.status).toBe("debriefed");
    expect(scenarioId).toBeTruthy();
  });
});

describe("只看未完成 listSessions({ unfinished })", () => {
  it("排除已复盘的练习，其余状态都保留", () => {
    const target = addMethodology("方法甲");
    const scenarioId = insertScenario(target, "场景");
    const base = Date.now();
    insertSession({ scenarioId, status: "debriefed", createdAt: base });
    const briefing = insertSession({ scenarioId, status: "briefing", createdAt: base + 1 });
    const active = insertSession({ scenarioId, status: "active", createdAt: base + 2 });
    const ended = insertSession({ scenarioId, status: "ended", createdAt: base + 3 });
    const failed = insertSession({ scenarioId, status: "debrief_failed", createdAt: base + 4 });

    const result = listSessions({ unfinished: true }, test.db);
    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.id)).toEqual([failed, ended, active, briefing]);
    expect(listSessions({}, test.db).total).toBe(5);
  });
});

describe("放弃练习 abandonSession", () => {
  it("briefing 状态可以放弃，场景保留以便重练", async () => {
    const a = addMethodology("方法甲");
    const practice = await createPractice(
      { selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(practice.sessionId, test.db).scenario.id;

    expect(abandonSession(practice.sessionId, test.db)).toEqual({ deleted: true });
    expect(() => getSession(practice.sessionId, test.db)).toThrowError(ApiError);
    expect(retryScenario(scenarioId, test.db).sessionId).toBeTruthy();
  });

  it("已开始的练习不能放弃", async () => {
    const a = addMethodology("方法甲");
    const practice = await createPractice(
      { selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    startSession(practice.sessionId, test.db);
    expect(() => abandonSession(practice.sessionId, test.db)).toThrowError(ApiError);
  });

  it("练习不存在返回 404", () => {
    expect(() => abandonSession(nanoid(), test.db)).toThrowError(ApiError);
  });
});

describe("重练 retryScenario", () => {
  it("新会话为 briefing，目标与场景不变", async () => {
    const a = addMethodology("方法甲");
    const practice = await createPractice(
      { selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(practice.sessionId, test.db).scenario.id;

    const { sessionId } = retryScenario(scenarioId, test.db);
    const retried = getSession(sessionId, test.db);
    expect(retried.id).not.toBe(practice.sessionId);
    expect(retried.status).toBe("briefing");
    expect(retried.targetMethodologyId).toBe(a);
    expect(retried.scenario.id).toBe(scenarioId);
    expect(retried.messages).toEqual([]);
  });

  it("场景不存在返回 404", () => {
    expect(() => retryScenario(nanoid(), test.db)).toThrowError(ApiError);
  });
});
