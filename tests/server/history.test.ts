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
  createPractice,
  getSession,
  listSessions,
  retryScenario,
  selectMethodology,
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

const emptyScope = { tagIds: [], sourceIds: [], methodologyIds: [] };

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
  mode: "drill" | "quiz";
  status: "briefing" | "active" | "ended" | "debriefed" | "debrief_failed";
  createdAt: number;
  selectedMethodologyId: string | null;
}): string {
  const id = nanoid();
  test.db
    .insert(practiceSessions)
    .values({
      id,
      scenarioId: params.scenarioId,
      mode: params.mode,
      status: params.status,
      selectedMethodologyId: params.selectedMethodologyId,
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
      candidateIds: [targetId],
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
      alternatives: [],
      designNotes: "",
      promptVersion: "scenario@1",
      createdAt: Date.now(),
    })
    .run();
  return id;
}

function insertDebrief(sessionId: string, params: { executionScore: number; recognition: "correct" | "partial" | "wrong" | null; outcome: "agreed" | "partial" | "refused" | "unresolved"; createdAt: number }): void {
  test.db
    .insert(debriefs)
    .values({
      id: nanoid(),
      sessionId,
      recognition: params.recognition,
      recognitionExplanation: params.recognition === null ? null : "解释",
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
      promptVersion: "debrief@1",
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
    const first = insertSession({ scenarioId, mode: "drill", status: "briefing", createdAt: base, selectedMethodologyId: target });
    const second = insertSession({ scenarioId, mode: "drill", status: "briefing", createdAt: base + 1000, selectedMethodologyId: target });
    const third = insertSession({ scenarioId, mode: "drill", status: "briefing", createdAt: base + 2000, selectedMethodologyId: target });

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

  it("专项练习显示目标方法论名称，综合测验复盘前不显示所用方法论", async () => {
    const a = addMethodology("方法甲");
    const b = addMethodology("方法乙");
    const drill = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const quiz = await createPractice(
      { mode: "quiz", selection: "random", scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    expect(getSession(quiz.sessionId, test.db).candidates?.length).toBe(2);
    selectMethodology(quiz.sessionId, b, test.db);
    startSession(quiz.sessionId, test.db);

    const items = listSessions({}, test.db).items;
    const drillItem = items.find((item) => item.id === drill.sessionId)!;
    const quizItem = items.find((item) => item.id === quiz.sessionId)!;
    expect(drillItem.methodologyName).toBe("方法甲");
    expect(drillItem.executionScore).toBeNull();
    expect(drillItem.recognition).toBeNull();
    expect(drillItem.outcome).toBeNull();
    expect(quizItem.methodologyName).toBeNull();
  });

  it("复盘后带出所用方法论、执行分、识别与说服结果", async () => {
    addMethodology("方法甲");
    const b = addMethodology("方法乙");
    const quiz = await createPractice(
      { mode: "quiz", selection: "random", scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(quiz.sessionId, test.db).scenario.id;
    selectMethodology(quiz.sessionId, b, test.db);
    startSession(quiz.sessionId, test.db);
    const now = Date.now();
    test.db
      .update(practiceSessions)
      .set({ status: "debriefed", endedAt: now })
      .where(eq(practiceSessions.id, quiz.sessionId))
      .run();
    insertDebrief(quiz.sessionId, { executionScore: 66, recognition: "partial", outcome: "agreed", createdAt: now });

    const item = listSessions({}, test.db).items.find((row) => row.id === quiz.sessionId)!;
    expect(item.methodologyName).toBe("方法乙");
    expect(item.executionScore).toBe(66);
    expect(item.recognition).toBe("partial");
    expect(item.outcome).toBe("agreed");
    expect(item.status).toBe("debriefed");
    expect(scenarioId).toBeTruthy();
  });
});

describe("重练 retryScenario", () => {
  it("专项练习重练沿用原模式，新会话为 briefing 且目标 = 场景的目标方法论", async () => {
    const a = addMethodology("方法甲");
    const drill = await createPractice(
      { mode: "drill", selection: "pick", methodologyId: a, scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(drill.sessionId, test.db).scenario.id;

    const { sessionId } = retryScenario(scenarioId, undefined, test.db);
    const retried = getSession(sessionId, test.db);
    expect(retried.id).not.toBe(drill.sessionId);
    expect(retried.mode).toBe("drill");
    expect(retried.status).toBe("briefing");
    expect(retried.selectedMethodologyId).toBe(a);
    expect(retried.scenario.id).toBe(scenarioId);
    expect(retried.messages).toEqual([]);
  });

  it("综合测验重练不带选择，候选列表仍然可用；可显式指定模式", async () => {
    addMethodology("方法甲");
    addMethodology("方法乙");
    const quiz = await createPractice(
      { mode: "quiz", selection: "random", scope: emptyScope, difficulty: "neutral" },
      { database: test.db },
    );
    const scenarioId = getSession(quiz.sessionId, test.db).scenario.id;

    const retried = getSession(retryScenario(scenarioId, undefined, test.db).sessionId, test.db);
    expect(retried.mode).toBe("quiz");
    expect(retried.selectedMethodologyId).toBeNull();
    expect(retried.candidates?.length).toBe(2);

    const asDrill = getSession(retryScenario(scenarioId, "drill", test.db).sessionId, test.db);
    expect(asDrill.mode).toBe("drill");
  });

  it("场景不存在返回 404", () => {
    expect(() => retryScenario(nanoid(), undefined, test.db)).toThrowError(ApiError);
  });
});
