import { z } from "zod";

import type { Difficulty, Outcome, PracticeMode } from "@/domain/schemas";
import type { MethodologyStatus } from "@/server/db/schema";

/** 统计的客户端 DTO。 */

export const StatsQuery = z.object({
  tagId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

/** 执行分趋势上的一个点。 */
export interface ExecTrendPointDto {
  endedAt: number;
  executionScore: number;
  difficulty: Difficulty;
  mode: PracticeMode;
  hintUsed: boolean;
}

/** 方法论概览的一行。 */
export interface MethodologyOverviewDto {
  methodologyId: string;
  name: string;
  /** 已归档的方法论如有历史练习也会列出，标「已归档」。 */
  status: MethodologyStatus;
  tags: string[];
  /** 作为所用方法论的专项练习 / 综合测验场数。 */
  drillCount: number;
  quizCount: number;
  execAvgAll: number | null;
  execAvgRecent: number | null;
  execAvgWithHint: number | null;
  execAvgWithoutHint: number | null;
  /** 按时间正序，最近 STATS_TREND_LIMIT 场。 */
  execTrend: ExecTrendPointDto[];
  recognitionAccuracy: number | null;
  recognitionN: number;
  mastery: number;
  lastPracticedAt: number | null;
}

/** 识别混淆的一行：目标方法论 X 被误选为 Y。 */
export interface ConfusionRowDto {
  targetId: string;
  targetName: string;
  selectedId: string;
  selectedName: string;
  wrongCount: number;
  partialCount: number;
}

/** 单个难度档的统计。 */
export interface DifficultyBucketDto {
  n: number;
  execAvg: number | null;
}

export interface DifficultyOverallDto extends DifficultyBucketDto {
  outcomeDistribution: Record<Outcome, number>;
}

export interface MethodologyDifficultyDto {
  methodologyId: string;
  name: string;
  status: MethodologyStatus;
  byDifficulty: Record<Difficulty, DifficultyBucketDto | null>;
}

/** 配合档与强硬档执行分均值差值最大的方法论。 */
export interface DifficultyGapDto {
  methodologyId: string;
  name: string;
  /** 配合档均值 − 强硬档均值。 */
  gap: number;
}

export interface StatsDifficultyDto {
  overall: Record<Difficulty, DifficultyOverallDto>;
  byMethodology: MethodologyDifficultyDto[];
  largestGap: DifficultyGapDto | null;
}

/** 首页「最需要练习」的一项。 */
export interface WeakestMethodologyDto {
  id: string;
  name: string;
  tags: string[];
  mastery: number;
  lastPracticedAt: number | null;
}
