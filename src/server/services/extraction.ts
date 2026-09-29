import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db, type AppDatabase } from "@/server/db/client";
import {
  jobs,
  mergeSuggestions,
  methodologies,
  sourceChunks,
  type ExtractionStatus,
  type MergeSuggestionStatus,
} from "@/server/db/schema";
import { countBodyMarks, type MergeSuggestionDto, type SourceDraftDto } from "@/server/dto/extraction";
import { toJobDto, type JobDto } from "@/server/dto/job";
import { tagNamesByMethodology } from "@/server/extraction/drafts";
import { ApiError } from "@/server/http";
import { getJobRunner, type JobRunner } from "@/server/jobs/runner";
import { isFakeLLM } from "@/server/llm/fake";
import { getLLMSettings } from "@/server/llm/settings";

import { getSource } from "./sources";

/** 抽取任务的入队、取消、重试，以及资料详情页所需的候选方法论与合并建议查询。 */

export interface ExtractionOptions {
  database?: AppDatabase;
  runner?: JobRunner;
}

function activeJobFor(database: AppDatabase, sourceId: string) {
  return database
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["queued", "running"]),
        sql`json_extract(${jobs.payload}, '$.sourceId') = ${sourceId}`,
      ),
    )
    .get();
}

function countChunks(database: AppDatabase, sourceId: string, statuses: ExtractionStatus[]): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(sourceChunks)
    .where(
      and(
        eq(sourceChunks.sourceId, sourceId),
        inArray(sourceChunks.extractionStatus, statuses),
      ),
    )
    .get();
  return row?.count ?? 0;
}

/** 入队抽取：处理该资料所有待抽取与失败的章节块，随后去重合并。 */
export function startExtraction(sourceId: string, options: ExtractionOptions = {}): JobDto {
  const database = options.database ?? db;
  const runner = options.runner ?? getJobRunner();

  getSource(sourceId, database);
  if (activeJobFor(database, sourceId)) {
    throw new ApiError(409, "invalid_state", "这份资料已有正在进行的抽取任务");
  }
  const total = countChunks(database, sourceId, ["pending", "running", "done", "failed"]);
  if (total === 0) {
    throw new ApiError(400, "invalid_input", "没有可抽取的章节块（全部已跳过）");
  }
  if (!isFakeLLM()) getLLMSettings(database);

  return toJobDto(runner.enqueue("extract_source", { sourceId }));
}

/** 重试失败章节：与开始抽取共用同一个任务，失败的块会被重新处理。 */
export function retryFailedChunks(sourceId: string, options: ExtractionOptions = {}): JobDto {
  const database = options.database ?? db;
  getSource(sourceId, database);
  if (countChunks(database, sourceId, ["failed"]) === 0) {
    throw new ApiError(400, "invalid_input", "没有失败的章节块");
  }
  return startExtraction(sourceId, options);
}

export function getJob(jobId: string, options: ExtractionOptions = {}): JobDto {
  const database = options.database ?? db;
  const row = database.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row) throw new ApiError(404, "not_found", "任务不存在");
  return toJobDto(row);
}

export function cancelJob(jobId: string, options: ExtractionOptions = {}): JobDto {
  const runner = options.runner ?? getJobRunner();
  const current = getJob(jobId, options);
  if (current.status !== "queued" && current.status !== "running") {
    throw new ApiError(409, "invalid_state", "任务已经结束，无法取消");
  }
  return toJobDto(runner.cancel(jobId));
}

/** 本资料的候选方法论（draft），按创建顺序。 */
export function listSourceDrafts(sourceId: string, database: AppDatabase = db): SourceDraftDto[] {
  const rows = database
    .select()
    .from(methodologies)
    .where(and(eq(methodologies.sourceId, sourceId), eq(methodologies.status, "draft")))
    .orderBy(asc(methodologies.createdAt), sql`rowid`)
    .all();
  const tagMap = tagNamesByMethodology(
    database,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    createdBy: row.createdBy,
    tags: tagMap.get(row.id) ?? [],
    stepCount: row.body.steps.length,
    ...countBodyMarks(row.body),
  }));
}

/**
 * 合并建议列表（默认只取待处理的）；sourceId 省略时不限资料。
 * 待处理的建议若成员已不全是 draft 则视为过期，不展示。
 */
export function listMergeSuggestions(
  sourceId?: string,
  database: AppDatabase = db,
  status: MergeSuggestionStatus = "open",
): MergeSuggestionDto[] {
  const rows = database
    .select()
    .from(mergeSuggestions)
    .where(
      and(
        eq(mergeSuggestions.status, status),
        sourceId ? eq(mergeSuggestions.sourceId, sourceId) : undefined,
      ),
    )
    .orderBy(desc(mergeSuggestions.createdAt))
    .all();
  const memberIds = [...new Set(rows.flatMap((row) => row.methodologyIds))];
  const members = new Map(
    (memberIds.length === 0
      ? []
      : database
          .select({ id: methodologies.id, name: methodologies.name, status: methodologies.status })
          .from(methodologies)
          .where(inArray(methodologies.id, memberIds))
          .all()
    ).map((row) => [row.id, row]),
  );
  return rows.flatMap((row) => {
    const resolved = row.methodologyIds.map((id) => members.get(id));
    if (resolved.some((m) => !m || (status === "open" && m.status !== "draft"))) return [];
    return [
      {
        id: row.id,
        sourceId: row.sourceId,
        reason: row.reason,
        members: resolved.map((m) => ({ id: m!.id, name: m!.name })),
      },
    ];
  });
}
