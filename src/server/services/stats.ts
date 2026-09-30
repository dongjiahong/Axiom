import { asc, eq } from "drizzle-orm";

import { HOME_WEAKEST_COUNT, STATS_RECENT_WINDOW, STATS_TREND_LIMIT } from "@/domain/constants";
import { computeMastery } from "@/domain/mastery";
import type { Difficulty, Outcome } from "@/domain/schemas";
import { db, type AppDatabase } from "@/server/db/client";
import {
  debriefs,
  methodologies,
  methodologyTags,
  practiceSessions,
  scenarios,
  tags,
  type MethodologyStatus,
} from "@/server/db/schema";
import type {
  DifficultyBucketDto,
  DifficultyOverallDto,
  ExecTrendPointDto,
  MethodologyDifficultyDto,
  MethodologyOverviewDto,
  StatsDifficultyDto,
  StatsQuery,
  WeakestMethodologyDto,
} from "@/server/dto/stats";

/**
 * 统计：只统计 `status='debriefed'` 的练习，分数用改判后重算的执行分。
 * 执行归属于场景的目标方法论；按方法论的 ID 聚合。
 */

export interface StatsOptions {
  database?: AppDatabase;
  /** 仅测试注入：计算掌握度所用的当前时间。 */
  now?: number;
}

const DIFFICULTIES: Difficulty[] = ["cooperative", "neutral", "tough"];
const OUTCOMES: Outcome[] = ["agreed", "partial", "refused", "unresolved"];

interface PracticeRecord {
  sessionId: string;
  difficulty: Difficulty;
  hintUsed: boolean;
  endedAt: number;
  executionScore: number;
  outcome: Outcome;
  targetMethodologyId: string;
}

interface MethodologyInfo {
  id: string;
  name: string;
  status: MethodologyStatus;
  sourceId: string | null;
  tagIds: string[];
  tagNames: string[];
}

// ───────────── 读取 ─────────────

/** 全部已复盘练习；按 endedAt 升序，趋势与「最近 N 场」都依赖这个顺序。 */
function loadRecords(database: AppDatabase): PracticeRecord[] {
  return database
    .select({
      sessionId: practiceSessions.id,
      difficulty: scenarios.difficulty,
      hintUsed: practiceSessions.hintUsed,
      endedAt: practiceSessions.endedAt,
      executionScore: debriefs.executionScore,
      outcome: debriefs.outcome,
      targetMethodologyId: scenarios.targetMethodologyId,
    })
    .from(practiceSessions)
    .innerJoin(scenarios, eq(scenarios.id, practiceSessions.scenarioId))
    .innerJoin(debriefs, eq(debriefs.sessionId, practiceSessions.id))
    .where(eq(practiceSessions.status, "debriefed"))
    .orderBy(asc(practiceSessions.endedAt), asc(practiceSessions.id))
    .all()
    .flatMap((row) => (row.endedAt === null ? [] : [{ ...row, endedAt: row.endedAt }]));
}

function loadMethodologies(database: AppDatabase): MethodologyInfo[] {
  const rows = database
    .select()
    .from(methodologies)
    .orderBy(methodologies.name, methodologies.id)
    .all();
  if (rows.length === 0) return [];
  const tagRows = database
    .select({ methodologyId: methodologyTags.methodologyId, tagId: tags.id, name: tags.name })
    .from(methodologyTags)
    .innerJoin(tags, eq(tags.id, methodologyTags.tagId))
    .all();
  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const row of tagRows) {
    tagMap.set(row.methodologyId, [...(tagMap.get(row.methodologyId) ?? []), { id: row.tagId, name: row.name }]);
  }
  return rows.map((row) => {
    const list = (tagMap.get(row.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      sourceId: row.sourceId,
      tagIds: list.map((tag) => tag.id),
      tagNames: list.map((tag) => tag.name),
    };
  });
}

// ───────────── 小组件 ─────────────

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function passesFilter(methodology: MethodologyInfo, filter: StatsQuery): boolean {
  if (filter.tagId && !methodology.tagIds.includes(filter.tagId)) return false;
  if (filter.sourceId && methodology.sourceId !== filter.sourceId) return false;
  return true;
}

function recordsOf(records: PracticeRecord[], id: string): PracticeRecord[] {
  return records.filter((record) => record.targetMethodologyId === id);
}

function lastPracticedAt(records: PracticeRecord[], id: string): number | null {
  const times = recordsOf(records, id).map((record) => record.endedAt);
  return times.length === 0 ? null : Math.max(...times);
}

function hasHistory(records: PracticeRecord[], id: string): boolean {
  return records.some((record) => record.targetMethodologyId === id);
}

/**
 * 统计涉及的方法论：全部已确认的，加上有历史练习的已归档（标「已归档」）；
 * 按标签 / 资料筛选后，默认按掌握度升序（最需要练的在前）。
 */
function statisticMethodologies(
  infos: MethodologyInfo[],
  records: PracticeRecord[],
  filter: StatsQuery,
  now: number,
): { info: MethodologyInfo; mastery: number }[] {
  return infos
    .filter(
      (info) =>
        info.status === "confirmed" || (info.status === "archived" && hasHistory(records, info.id)),
    )
    .filter((info) => passesFilter(info, filter))
    .map((info) => ({ info, mastery: computeMastery(info.id, records, now) }))
    .sort(
      (a, b) => a.mastery - b.mastery || a.info.name.localeCompare(b.info.name, "zh-CN"),
    );
}

// ───────────── 概览 ─────────────

function toOverviewRow(
  info: MethodologyInfo,
  mastery: number,
  records: PracticeRecord[],
): MethodologyOverviewDto {
  const practices = recordsOf(records, info.id);
  const trend: ExecTrendPointDto[] = practices.slice(-STATS_TREND_LIMIT).map((record) => ({
    endedAt: record.endedAt,
    executionScore: record.executionScore,
    difficulty: record.difficulty,
    hintUsed: record.hintUsed,
  }));

  return {
    methodologyId: info.id,
    name: info.name,
    status: info.status,
    tags: info.tagNames,
    practiceCount: practices.length,
    execAvgAll: mean(practices.map((record) => record.executionScore)),
    execAvgRecent: mean(
      practices.slice(-STATS_RECENT_WINDOW).map((record) => record.executionScore),
    ),
    execAvgWithHint: mean(
      practices.filter((record) => record.hintUsed).map((record) => record.executionScore),
    ),
    execAvgWithoutHint: mean(
      practices.filter((record) => !record.hintUsed).map((record) => record.executionScore),
    ),
    execTrend: trend,
    mastery,
    lastPracticedAt: lastPracticedAt(records, info.id),
  };
}

export function getStatsOverview(
  filter: StatsQuery = {},
  options: StatsOptions = {},
): MethodologyOverviewDto[] {
  const database = options.database ?? db;
  const now = options.now ?? Date.now();
  const records = loadRecords(database);
  return statisticMethodologies(loadMethodologies(database), records, filter, now).map(
    ({ info, mastery }) => toOverviewRow(info, mastery, records),
  );
}

// ───────────── 难度分层 ─────────────

export function getStatsDifficulty(
  filter: StatsQuery = {},
  options: StatsOptions = {},
): StatsDifficultyDto {
  const database = options.database ?? db;
  const now = options.now ?? Date.now();
  const records = loadRecords(database);
  const infos = loadMethodologies(database);
  const byId = new Map(infos.map((info) => [info.id, info]));

  // 总体按目标方法论（即所用方法论）筛选
  const filtered = records.filter((record) => {
    const info = byId.get(record.targetMethodologyId);
    return info ? passesFilter(info, filter) : false;
  });

  const overall = {} as Record<Difficulty, DifficultyOverallDto>;
  for (const difficulty of DIFFICULTIES) {
    const list = filtered.filter((record) => record.difficulty === difficulty);
    overall[difficulty] = {
      n: list.length,
      execAvg: mean(list.map((record) => record.executionScore)),
      outcomeDistribution: Object.fromEntries(
        OUTCOMES.map((outcome) => [outcome, list.filter((r) => r.outcome === outcome).length]),
      ) as Record<Outcome, number>,
    };
  }

  const byMethodology: MethodologyDifficultyDto[] = statisticMethodologies(
    infos,
    records,
    filter,
    now,
  ).map(({ info }) => {
    const practices = recordsOf(records, info.id);
    const byDifficulty = {} as Record<Difficulty, DifficultyBucketDto | null>;
    for (const difficulty of DIFFICULTIES) {
      const list = practices.filter((record) => record.difficulty === difficulty);
      byDifficulty[difficulty] =
        list.length === 0
          ? null
          : { n: list.length, execAvg: mean(list.map((record) => record.executionScore)) };
    }
    return { methodologyId: info.id, name: info.name, status: info.status, byDifficulty };
  });

  const gaps = byMethodology.flatMap((row) => {
    const cooperative = row.byDifficulty.cooperative;
    const tough = row.byDifficulty.tough;
    if (!cooperative || !tough) return [];
    return [
      {
        methodologyId: row.methodologyId,
        name: row.name,
        gap: round1(cooperative.execAvg! - tough.execAvg!),
      },
    ];
  });

  return {
    overall,
    byMethodology,
    largestGap: gaps.length === 0 ? null : gaps.reduce((best, cur) => (cur.gap > best.gap ? cur : best)),
  };
}

// ───────────── 首页「最需要练习」 ─────────────

export function listWeakestMethodologies(
  limit: number = HOME_WEAKEST_COUNT,
  options: StatsOptions = {},
): WeakestMethodologyDto[] {
  const database = options.database ?? db;
  const now = options.now ?? Date.now();
  const records = loadRecords(database);
  return loadMethodologies(database)
    .filter((info) => info.status === "confirmed")
    .map((info) => ({
      id: info.id,
      name: info.name,
      tags: info.tagNames,
      mastery: computeMastery(info.id, records, now),
      lastPracticedAt: lastPracticedAt(records, info.id),
    }))
    .sort((a, b) => a.mastery - b.mastery || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}
