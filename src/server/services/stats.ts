import { asc, eq } from "drizzle-orm";

import {
  HOME_WEAKEST_COUNT,
  RECOGNITION_SCORE,
  STATS_RECENT_WINDOW,
  STATS_TREND_LIMIT,
} from "@/domain/constants";
import { computeMastery } from "@/domain/mastery";
import type { Difficulty, Outcome, PracticeMode, Recognition } from "@/domain/schemas";
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
  ConfusionRowDto,
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
 * 执行归属于 selectedMethodologyId，识别归属于场景的目标方法论；按方法论的 ID 聚合。
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
  mode: PracticeMode;
  difficulty: Difficulty;
  hintUsed: boolean;
  endedAt: number;
  executionScore: number;
  recognition: Recognition | null;
  outcome: Outcome;
  selectedMethodologyId: string | null;
  targetMethodologyId: string;
}

interface RecognitionRecord extends PracticeRecord {
  mode: "quiz";
  recognition: Recognition;
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
      mode: practiceSessions.mode,
      difficulty: scenarios.difficulty,
      hintUsed: practiceSessions.hintUsed,
      endedAt: practiceSessions.endedAt,
      executionScore: debriefs.executionScore,
      recognition: debriefs.recognition,
      outcome: debriefs.outcome,
      selectedMethodologyId: practiceSessions.selectedMethodologyId,
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function execRecordsOf(records: PracticeRecord[], id: string): PracticeRecord[] {
  return records.filter((record) => record.selectedMethodologyId === id);
}

function recognitionRecordsOf(records: PracticeRecord[], id: string): RecognitionRecord[] {
  return records.filter(
    (record): record is RecognitionRecord =>
      record.mode === "quiz" && record.targetMethodologyId === id && record.recognition !== null,
  );
}

function lastPracticedAt(records: PracticeRecord[], id: string): number | null {
  const times = records
    .filter((record) => record.selectedMethodologyId === id || record.targetMethodologyId === id)
    .map((record) => record.endedAt);
  return times.length === 0 ? null : Math.max(...times);
}

function hasHistory(records: PracticeRecord[], id: string): boolean {
  return records.some(
    (record) => record.selectedMethodologyId === id || record.targetMethodologyId === id,
  );
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
  const exec = execRecordsOf(records, info.id);
  const recog = recognitionRecordsOf(records, info.id);
  const drills = exec.filter((record) => record.mode === "drill");
  const trend: ExecTrendPointDto[] = exec.slice(-STATS_TREND_LIMIT).map((record) => ({
    endedAt: record.endedAt,
    executionScore: record.executionScore,
    difficulty: record.difficulty,
    mode: record.mode,
    hintUsed: record.hintUsed,
  }));

  return {
    methodologyId: info.id,
    name: info.name,
    status: info.status,
    tags: info.tagNames,
    drillCount: drills.length,
    quizCount: exec.length - drills.length,
    execAvgAll: mean(exec.map((record) => record.executionScore)),
    execAvgRecent: mean(exec.slice(-STATS_RECENT_WINDOW).map((record) => record.executionScore)),
    execAvgWithHint: mean(
      drills.filter((record) => record.hintUsed).map((record) => record.executionScore),
    ),
    execAvgWithoutHint: mean(
      drills.filter((record) => !record.hintUsed).map((record) => record.executionScore),
    ),
    execTrend: trend,
    recognitionAccuracy:
      recog.length === 0
        ? null
        : round2(
            recog.reduce((sum, record) => sum + RECOGNITION_SCORE[record.recognition], 0) /
              recog.length,
          ),
    recognitionN: recog.length,
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

// ───────────── 识别混淆 ─────────────

export function getStatsConfusion(
  filter: StatsQuery = {},
  options: StatsOptions = {},
): ConfusionRowDto[] {
  const database = options.database ?? db;
  const records = loadRecords(database);
  const byId = new Map(loadMethodologies(database).map((info) => [info.id, info]));
  const rows = new Map<string, ConfusionRowDto>();

  for (const record of records) {
    if (record.mode !== "quiz" || record.recognition === null || record.recognition === "correct") {
      continue;
    }
    if (!record.selectedMethodologyId || record.selectedMethodologyId === record.targetMethodologyId) {
      continue;
    }
    const target = byId.get(record.targetMethodologyId);
    const selected = byId.get(record.selectedMethodologyId);
    if (!target || !selected) continue;
    if (!passesFilter(target, filter) && !passesFilter(selected, filter)) continue;

    const key = `${target.id}\u0000${selected.id}`;
    const row = rows.get(key) ?? {
      targetId: target.id,
      targetName: target.name,
      selectedId: selected.id,
      selectedName: selected.name,
      wrongCount: 0,
      partialCount: 0,
    };
    if (record.recognition === "wrong") row.wrongCount += 1;
    else row.partialCount += 1;
    rows.set(key, row);
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.wrongCount + b.partialCount - (a.wrongCount + a.partialCount) ||
      a.targetName.localeCompare(b.targetName, "zh-CN") ||
      a.selectedName.localeCompare(b.selectedName, "zh-CN"),
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

  // 总体按执行归属（所用方法论）筛选
  const filtered = records.filter((record) => {
    const info = record.selectedMethodologyId ? byId.get(record.selectedMethodologyId) : undefined;
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
    const exec = execRecordsOf(records, info.id);
    const byDifficulty = {} as Record<Difficulty, DifficultyBucketDto | null>;
    for (const difficulty of DIFFICULTIES) {
      const list = exec.filter((record) => record.difficulty === difficulty);
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
