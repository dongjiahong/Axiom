import type { JobStage, JobStatus, SourceFormat, SourceStatus } from "@/server/db/schema";

/** 资料相关 DTO。 */

export interface SourceListItemDto {
  id: string;
  title: string;
  author: string | null;
  format: SourceFormat;
  charCount: number;
  status: SourceStatus;
  chunkCount: number;
  draftCount: number;
  confirmedCount: number;
  createdAt: number;
}

export interface SourceChunkSummaryDto {
  id: string;
  seq: number;
  title: string;
  charCount: number;
  extractionStatus: string;
  extractionError: string | null;
}

export interface SourceJobDto {
  id: string;
  status: JobStatus;
  stage: JobStage | null;
  progressDone: number;
  progressTotal: number;
  error: string | null;
}

export interface SourceDetailDto {
  id: string;
  title: string;
  author: string | null;
  format: SourceFormat;
  originalFilename: string;
  charCount: number;
  status: SourceStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  chunks: SourceChunkSummaryDto[];
  job: SourceJobDto | null;
  /** 预估 token：总字数 × 系数，界面标注"粗略估计"。 */
  estimatedTokens: number;
  draftCount: number;
  confirmedCount: number;
}

export interface SourceChunkTextDto {
  id: string;
  title: string;
  text: string;
}

/** 批量跳过 / 取消跳过的结果：locked 为已开始抽取、无法改动的章节块数。 */
export interface SourceChunksBulkSkipDto {
  updated: number;
  locked: number;
}
