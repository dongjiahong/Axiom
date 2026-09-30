import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Difficulty, Outcome } from "@/domain/schemas";
import {
  debriefs,
  methodologies,
  methodologyTags,
  practiceSessions,
  scenarios,
  sources,
  tags,
  type MethodologyStatus,
  type SessionStatus,
} from "@/server/db/schema";
import {
  getStatsDifficulty,
  getStatsOverview,
  listWeakestMethodologies,
} from "@/server/services/stats";

import { makeMethodologyBody } from "../fixtures/methodology";
import { createTestDb, type TestDb } from "../helpers/db";

/**
 * 统计：只统计已复盘的练习；执行归属于目标方法论。
 * 每个 describe 自建所需的最小数据（beforeEach 清库）。
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;
const NOW = T0 + 20 * DAY;

let test: TestDb;

beforeAll(() => {
  test = createTestDb();
});

afterAll(() => {
  test.close();
});

beforeEach(() => {
  test.db.delete(debriefs).run();
  test.db.delete(practiceSessions).run();
  test.db.delete(scenarios).run();
  test.db.delete(methodologyTags).run();
  test.db.delete(methodologies).run();
  test.db.delete(tags).run();
  test.db.delete(sources).run();
});

// ───────────── 夹具 ─────────────

function addSource(id: string, title = "测试资料"): string {
  test.db
    .insert(sources)
    .values({
      id,
      title,
      author: null,
      format: "txt",
      originalFilename: "sample.txt",
      filePath: "/tmp/sample.txt",
      charCount: 100,
      status: "extracted",
      error: null,
      createdAt: T0,
      updatedAt: T0,
    })
    .run();
  return id;
}

function addMethodology(opts: {
  id: string;
  name: string;
  status?: MethodologyStatus;
  tagNames?: string[];
  sourceId?: string | null;
}): string {
  test.db
    .insert(methodologies)
    .values({
      id: opts.id,
      sourceId: opts.sourceId ?? null,
      status: opts.status ?? "confirmed",
      name: opts.name,
      body: makeMethodologyBody(),
      originChunkIds: [],
      createdBy: "seed",
      version: 1,
      createdAt: T0,
      updatedAt: T0,
      confirmedAt: T0,
    })
    .run();
  for (const name of opts.tagNames ?? []) {
    const existing = test.db.select().from(tags).where(eq(tags.name, name)).get();
    const tagId = existing?.id ?? nanoid();
    if (!existing) test.db.insert(tags).values({ id: tagId, name }).run();
    test.db.insert(methodologyTags).values({ methodologyId: opts.id, tagId }).run();
  }
  return opts.id;
}

interface SessionSpec {
  target: string;
  difficulty: Difficulty;
  hintUsed?: boolean;
  /** 相对 T0 的天数。 */
  at: number;
  executionScore: number;
  outcome?: Outcome;
  status?: SessionStatus;
}

function addSession(spec: SessionSpec): string {
  const scenarioId = nanoid();
  const sessionId = nanoid();
  const endedAt = T0 + spec.at * DAY;

  test.db
    .insert(scenarios)
    .values({
      id: scenarioId,
      targetMethodologyId: spec.target,
      targetVersion: 1,
      difficulty: spec.difficulty,
      scope: { tagIds: [], sourceIds: [] },
      title: "场景",
      background: "背景",
      userRole: "你",
      userGoal: "目标",
      counterpartName: "对方",
      counterpartRelation: "同事",
      counterpartProfile: "简介",
      openingSpeaker: "counterpart",
      openingLine: "你好",
      brief: {
        personality: "性格",
        trueStance: "立场",
        hiddenConcerns: [],
        plannedResistance: [],
        yieldConditions: "让步条件",
        breakdownConditions: "谈崩条件",
      },
      designNotes: "设计说明",
      promptVersion: "scenario@2",
      createdAt: endedAt,
    })
    .run();

  const status = spec.status ?? "debriefed";
  test.db
    .insert(practiceSessions)
    .values({
      id: sessionId,
      scenarioId,
      status,
      targetSnapshot: null,
      hintUsed: spec.hintUsed ?? false,
      maxTurns: 12,
      endReason: "user",
      endNote: null,
      createdAt: endedAt,
      startedAt: endedAt,
      endedAt: status === "briefing" ? null : endedAt,
    })
    .run();

  if (status === "debriefed") {
    test.db
      .insert(debriefs)
      .values({
        id: nanoid(),
        sessionId,
        executionScore: spec.executionScore,
        scoreBreakdown: {
          base: spec.executionScore,
          steps: [],
          principlePenalty: 0,
          violatedPrincipleIds: [],
          orderPenalty: 0,
          orderViolation: null,
          executionScore: spec.executionScore,
        },
        holisticScore: 70,
        holisticComment: "点评",
        outcome: spec.outcome ?? "unresolved",
        outcomeNote: "说明",
        summary: { strengths: [], improvements: [] },
        promptVersion: "debrief@2",
        createdAt: endedAt,
        updatedAt: endedAt,
      })
      .run();
  }
  return sessionId;
}

function overviewRow(name: string) {
  const rows = getStatsOverview({}, { database: test.db, now: NOW });
  const row = rows.find((item) => item.name === name);
  expect(row, `概览中应有「${name}」`).toBeDefined();
  return row!;
}

/** 按名称取标签 ID（统计筛选用的是标签 ID）。 */
function tagIdOf(name: string): string {
  const row = test.db.select().from(tags).where(eq(tags.name, name)).get();
  expect(row, `标签「${name}」应存在`).toBeDefined();
  return row!.id;
}

// ───────────── 概览 ─────────────

describe("方法论概览", () => {
  const M1 = "m1";
  const M2 = "m2";
  const M3 = "m3";
  const M4 = "m4";
  const M5 = "m5";

  beforeEach(() => {
    addMethodology({ id: M1, name: "甲方法", tagNames: ["职场"] });
    addMethodology({ id: M2, name: "乙方法", tagNames: ["亲密关系"] });
    addMethodology({ id: M3, name: "丙方法", status: "archived", tagNames: ["职场"] });
    addMethodology({ id: M4, name: "丁方法", status: "archived" });
    addMethodology({ id: M5, name: "戊方法", status: "draft" });

    // 甲：7 场练习（其中 1 场看过提示）；执行分 80/40/100/70/30/10/20
    const practice = (at: number, difficulty: Difficulty, executionScore: number, hintUsed = false) =>
      addSession({ target: M1, difficulty, hintUsed, at, executionScore });
    practice(1, "cooperative", 80);
    practice(2, "tough", 40, true);
    practice(4, "cooperative", 100);
    practice(6, "neutral", 70);
    practice(8, "neutral", 30);
    practice(9, "tough", 10);
    practice(10, "cooperative", 20);
    // 丙：已归档但有 1 场练习
    addSession({ target: M3, difficulty: "cooperative", at: 7, executionScore: 90 });
    // 未复盘 / 未开始的练习不计入
    addSession({ target: M1, difficulty: "cooperative", at: 12, executionScore: 0, status: "ended" });
    addSession({ target: M1, difficulty: "tough", at: 13, executionScore: 0, status: "active" });
  });

  it("每个字段按统计口径聚合，且不统计未复盘的练习", () => {
    const m1 = overviewRow("甲方法");
    expect(m1).toEqual({
      methodologyId: M1,
      name: "甲方法",
      status: "confirmed",
      tags: ["职场"],
      practiceCount: 7,
      execAvgAll: 50,
      execAvgRecent: 46,
      execAvgWithHint: 40,
      execAvgWithoutHint: 51.7,
      execTrend: [
        { endedAt: T0 + 1 * DAY, executionScore: 80, difficulty: "cooperative", hintUsed: false },
        { endedAt: T0 + 2 * DAY, executionScore: 40, difficulty: "tough", hintUsed: true },
        { endedAt: T0 + 4 * DAY, executionScore: 100, difficulty: "cooperative", hintUsed: false },
        { endedAt: T0 + 6 * DAY, executionScore: 70, difficulty: "neutral", hintUsed: false },
        { endedAt: T0 + 8 * DAY, executionScore: 30, difficulty: "neutral", hintUsed: false },
        { endedAt: T0 + 9 * DAY, executionScore: 10, difficulty: "tough", hintUsed: false },
        { endedAt: T0 + 10 * DAY, executionScore: 20, difficulty: "cooperative", hintUsed: false },
      ],
      mastery: expect.any(Number),
      lastPracticedAt: T0 + 10 * DAY,
    });
    // 掌握度：最近 5 场均值（20+10+30+70+100）/5/100 = 0.46；10 天前练过，decay ≈ 0.89685
    expect(m1.mastery).toBeCloseTo(0.4126, 3);

    const m2 = overviewRow("乙方法");
    expect(m2).toEqual({
      methodologyId: M2,
      name: "乙方法",
      status: "confirmed",
      tags: ["亲密关系"],
      practiceCount: 0,
      execAvgAll: null,
      execAvgRecent: null,
      execAvgWithHint: null,
      execAvgWithoutHint: null,
      execTrend: [],
      mastery: 0,
      lastPracticedAt: null,
    });

    const m3 = overviewRow("丙方法");
    expect(m3).toMatchObject({
      methodologyId: M3,
      name: "丙方法",
      status: "archived",
      practiceCount: 1,
      execAvgAll: 90,
      execAvgRecent: 90,
      execAvgWithHint: null,
      execAvgWithoutHint: 90,
      lastPracticedAt: T0 + 7 * DAY,
    });
    expect(m3.mastery).toBeCloseTo(0.7832, 3);
  });

  it("列表：已确认全部 + 有历史的已归档；从未练过的（mastery 0）排最前", () => {
    const rows = getStatsOverview({}, { database: test.db, now: NOW });
    expect(rows.map((row) => row.methodologyId)).toEqual([M2, M1, M3]);
    // 已归档但没有任何练习 → 不列出；候选方法论也不列出
    expect(rows.some((row) => row.methodologyId === M4)).toBe(false);
    expect(rows.some((row) => row.methodologyId === M5)).toBe(false);
  });

  it("execTrend 最多保留最近 STATS_TREND_LIMIT 场（按时间正序）", () => {
    for (let i = 14; i < 40; i++) {
      addSession({ target: M1, difficulty: "neutral", at: i, executionScore: i % 100 });
    }
    const m1 = overviewRow("甲方法");
    expect(m1.execTrend).toHaveLength(30);
    // 共 33 场（7 + 26），丢掉最早的 3 场（第 1、2、4 天）
    expect(m1.execTrend[0].endedAt).toBe(T0 + 6 * DAY);
    expect(m1.execTrend.at(-1)!.endedAt).toBe(T0 + 39 * DAY);
  });

  it("按标签 / 资料筛选（筛选的是方法论）", () => {
    expect(
      getStatsOverview({ tagId: tagIdOf("职场") }, { database: test.db, now: NOW }).map((r) => r.methodologyId),
    ).toEqual([M1, M3]);
    expect(
      getStatsOverview({ tagId: tagIdOf("亲密关系") }, { database: test.db, now: NOW }).map((r) => r.methodologyId),
    ).toEqual([M2]);
    // 标签 id 不存在 / 两者冲突时为空
    expect(getStatsOverview({ tagId: "nope" }, { database: test.db, now: NOW })).toEqual([]);
  });

  it("资料筛选按方法论的 sourceId", () => {
    const sourceId = addSource("s1");
    expect(getStatsOverview({ sourceId }, { database: test.db, now: NOW })).toEqual([]);
    test.db
      .update(methodologies)
      .set({ sourceId })
      .where(eq(methodologies.id, M1))
      .run();
    expect(
      getStatsOverview({ sourceId }, { database: test.db, now: NOW }).map((r) => r.methodologyId),
    ).toEqual([M1]);
  });

  it("没有任何练习时返回空列表", () => {
    test.db.delete(debriefs).run();
    test.db.delete(practiceSessions).run();
    test.db.delete(scenarios).run();
    test.db.delete(methodologyTags).run();
    test.db.delete(methodologies).run();
    expect(getStatsOverview({}, { database: test.db, now: NOW })).toEqual([]);
  });
});

// ───────────── 难度分层 ─────────────

describe("难度分层", () => {
  const M1 = "m1";
  const M2 = "m2";
  const M3 = "m3";

  beforeEach(() => {
    addMethodology({ id: M1, name: "甲方法", tagNames: ["职场"] });
    addMethodology({ id: M2, name: "乙方法", tagNames: ["亲密关系"] });
    addMethodology({ id: M3, name: "丙方法", tagNames: ["家庭"] });

    addSession({ target: M1, difficulty: "cooperative", at: 1, executionScore: 80, outcome: "agreed" });
    addSession({ target: M1, difficulty: "cooperative", at: 2, executionScore: 100, outcome: "agreed" });
    addSession({ target: M1, difficulty: "tough", at: 3, executionScore: 40, outcome: "refused" });
    addSession({ target: M2, difficulty: "cooperative", at: 5, executionScore: 50, outcome: "partial" });
    addSession({ target: M2, difficulty: "tough", at: 6, executionScore: 100, outcome: "refused" });
    addSession({ target: M3, difficulty: "neutral", at: 7, executionScore: 60, outcome: "unresolved" });
  });

  it("总体：每个难度的场数、执行分均值与说服结果分布", () => {
    const { overall } = getStatsDifficulty({}, { database: test.db, now: NOW });
    expect(overall).toEqual({
      cooperative: {
        n: 3,
        execAvg: 76.7,
        outcomeDistribution: { agreed: 2, partial: 1, refused: 0, unresolved: 0 },
      },
      neutral: {
        n: 1,
        execAvg: 60,
        outcomeDistribution: { agreed: 0, partial: 0, refused: 0, unresolved: 1 },
      },
      tough: {
        n: 2,
        execAvg: 70,
        outcomeDistribution: { agreed: 0, partial: 0, refused: 2, unresolved: 0 },
      },
    });
  });

  it("按方法论：每档 { n, execAvg } 或 null", () => {
    const { byMethodology } = getStatsDifficulty({}, { database: test.db, now: NOW });
    expect(byMethodology.map((row) => row.methodologyId).sort()).toEqual([M1, M2, M3]);

    const m1 = byMethodology.find((row) => row.methodologyId === M1)!;
    expect(m1.status).toBe("confirmed");
    expect(m1.byDifficulty).toEqual({
      cooperative: { n: 2, execAvg: 90 },
      neutral: null,
      tough: { n: 1, execAvg: 40 },
    });

    const m2 = byMethodology.find((row) => row.methodologyId === M2)!;
    expect(m2.byDifficulty).toEqual({
      cooperative: { n: 1, execAvg: 50 },
      neutral: null,
      tough: { n: 1, execAvg: 100 },
    });

    const m3 = byMethodology.find((row) => row.methodologyId === M3)!;
    expect(m3.byDifficulty).toEqual({ cooperative: null, neutral: { n: 1, execAvg: 60 }, tough: null });
  });

  it("largestGap：配合档与强硬档差值最大者", () => {
    const { largestGap } = getStatsDifficulty({}, { database: test.db, now: NOW });
    expect(largestGap).toEqual({ methodologyId: M1, name: "甲方法", gap: 50 });
  });

  it("筛选与空数据", () => {
    const filtered = getStatsDifficulty({ tagId: tagIdOf("亲密关系") }, { database: test.db, now: NOW });
    // 只保留目标方法论属于「亲密关系」的练习（乙方法的 2 场）
    expect(filtered.overall.cooperative).toEqual({
      n: 1,
      execAvg: 50,
      outcomeDistribution: { agreed: 0, partial: 1, refused: 0, unresolved: 0 },
    });
    expect(filtered.overall.neutral.n).toBe(0);
    expect(filtered.overall.neutral.execAvg).toBeNull();
    expect(filtered.overall.tough.n).toBe(1);
    expect(filtered.byMethodology.map((row) => row.methodologyId)).toEqual([M2]);
    // 乙方法配合 50 − 强硬 100 = -50
    expect(filtered.largestGap).toEqual({ methodologyId: M2, name: "乙方法", gap: -50 });
  });
});

// ───────────── 首页「最需要练习」 ─────────────

describe("最需要练习", () => {
  const M1 = "m1";
  const M2 = "m2";
  const M3 = "m3";
  const M4 = "m4";

  beforeEach(() => {
    addMethodology({ id: M1, name: "甲方法", tagNames: ["职场"] });
    addMethodology({ id: M2, name: "乙方法", tagNames: ["亲密关系"] });
    addMethodology({ id: M3, name: "丙方法", status: "archived" });
    addMethodology({ id: M4, name: "丁方法", status: "draft" });
    addSession({ target: M1, difficulty: "cooperative", at: 1, executionScore: 50 });
    addSession({ target: M3, difficulty: "cooperative", at: 2, executionScore: 90 });
  });

  it("只取已确认的方法论，按掌握度升序，默认 3 个", () => {
    const rows = listWeakestMethodologies(3, { database: test.db, now: NOW });
    // 从未练过的乙方法优先
    expect(rows.map((row) => row.id)).toEqual([M2, M1]);
    expect(rows[0]).toMatchObject({ id: M2, name: "乙方法", tags: ["亲密关系"], mastery: 0, lastPracticedAt: null });
    expect(rows[1].id).toBe(M1);
    expect(rows[1].tags).toEqual(["职场"]);
    expect(rows[1].mastery).toBeGreaterThan(0);
    expect(rows[1].lastPracticedAt).toBe(T0 + 1 * DAY);
    // 已归档 / 候选不出现在首页
    expect(rows.some((row) => row.id === M3 || row.id === M4)).toBe(false);
  });

  it("limit 生效；没有已确认方法论时为空", () => {
    expect(listWeakestMethodologies(1, { database: test.db, now: NOW })).toHaveLength(1);
    test.db.delete(debriefs).run();
    test.db.delete(practiceSessions).run();
    test.db.delete(scenarios).run();
    test.db.delete(methodologyTags).run();
    test.db.delete(methodologies).run();
    expect(listWeakestMethodologies(3, { database: test.db, now: NOW })).toEqual([]);
  });
});
