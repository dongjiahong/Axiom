import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";

import { TOKEN_ESTIMATE_PER_CHAR, UPLOAD_MAX_BYTES } from "@/domain/constants";
import { db, type AppDatabase } from "@/server/db/client";
import { jobs, methodologies, sourceChunks, sources } from "@/server/db/schema";
import type {
  SourceChunkTextDto,
  SourceDetailDto,
  SourceListItemDto,
} from "@/server/dto/source";
import { ApiError } from "@/server/http";
import {
  assertFormatMatchesContent,
  buildChunks,
  detectFormat,
  ParseError,
  parseSource,
} from "@/server/parsing";

/** 资料导入与解析。 */

export interface SourceServiceOptions {
  database?: AppDatabase;
  uploadsDir?: string;
}

/** 上传文件目录：`${AXIOM_DATA_DIR}/uploads`。 */
export function resolveUploadsDir(): string {
  const dataDir = process.env.AXIOM_DATA_DIR?.trim() || "./data";
  return join(dataDir, "uploads");
}

function sumCharCount(chunks: { text: string }[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
}

/** 上传 → 解析 → 分块 →（同一事务）写库；解析失败不落库。 */
export async function uploadSource(
  input: { filename: string; buffer: Buffer },
  options: SourceServiceOptions = {},
): Promise<SourceDetailDto> {
  const database = options.database ?? db;
  const uploadsDir = options.uploadsDir ?? resolveUploadsDir();

  const format = detectFormat(input.filename);
  if (!format) {
    throw new ApiError(400, "invalid_input", "只支持 epub、pdf、txt、md 格式的文件");
  }
  if (input.buffer.length === 0) {
    throw new ApiError(400, "invalid_input", "文件内容为空");
  }
  if (input.buffer.length > UPLOAD_MAX_BYTES) {
    throw new ApiError(400, "invalid_input", "文件超过 50MB 上限");
  }

  let parsed;
  try {
    assertFormatMatchesContent(format, input.buffer);
    parsed = await parseSource(format, input.buffer, input.filename);
  } catch (err) {
    if (err instanceof ParseError) throw new ApiError(400, "invalid_input", err.message);
    throw err;
  }
  if (parsed.sections.length === 0) {
    throw new ApiError(400, "invalid_input", "未能从文件中解析出任何内容");
  }
  const chunks = buildChunks(parsed.sections);
  if (chunks.length === 0) {
    throw new ApiError(400, "invalid_input", "未能从文件中解析出任何章节");
  }

  const id = nanoid();
  const filePath = join(uploadsDir, `${id}.${format}`);
  const now = Date.now();
  mkdirSync(uploadsDir, { recursive: true });
  writeFileSync(filePath, input.buffer);

  database.transaction((tx) => {
    tx.insert(sources)
      .values({
        id,
        title: parsed.title,
        author: parsed.author,
        format,
        originalFilename: input.filename,
        filePath,
        charCount: sumCharCount(chunks),
        status: "ready",
        error: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    for (const chunk of chunks) {
      tx.insert(sourceChunks)
        .values({
          id: nanoid(),
          sourceId: id,
          seq: chunk.seq,
          title: chunk.title,
          text: chunk.text,
          charCount: chunk.text.length,
          extractionStatus: chunk.skipped ? "skipped" : "pending",
          extractionError: null,
          extractedAt: null,
        })
        .run();
    }
  });

  return getSourceDetail(id, database);
}

/** 方法论数量按状态聚合，避免逐行查询。 */
function methodologyCounts(
  database: AppDatabase,
  sourceIds: string[],
): Map<string, { draft: number; confirmed: number }> {
  const result = new Map<string, { draft: number; confirmed: number }>();
  if (sourceIds.length === 0) return result;
  const rows = database
    .select({
      sourceId: methodologies.sourceId,
      status: methodologies.status,
      count: sql<number>`count(*)`,
    })
    .from(methodologies)
    .where(inArray(methodologies.sourceId, sourceIds))
    .groupBy(methodologies.sourceId, methodologies.status)
    .all();
  for (const row of rows) {
    if (!row.sourceId) continue;
    const entry = result.get(row.sourceId) ?? { draft: 0, confirmed: 0 };
    if (row.status === "draft") entry.draft = row.count;
    if (row.status === "confirmed") entry.confirmed = row.count;
    result.set(row.sourceId, entry);
  }
  return result;
}

function chunkCounts(database: AppDatabase, sourceIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (sourceIds.length === 0) return result;
  const rows = database
    .select({ sourceId: sourceChunks.sourceId, count: sql<number>`count(*)` })
    .from(sourceChunks)
    .where(inArray(sourceChunks.sourceId, sourceIds))
    .groupBy(sourceChunks.sourceId)
    .all();
  for (const row of rows) result.set(row.sourceId, row.count);
  return result;
}

export function listSources(database: AppDatabase = db): SourceListItemDto[] {
  const rows = database.select().from(sources).orderBy(desc(sources.createdAt)).all();
  const ids = rows.map((row) => row.id);
  const chunkMap = chunkCounts(database, ids);
  const methodologyMap = methodologyCounts(database, ids);

  return rows.map((row) => {
    const counts = methodologyMap.get(row.id) ?? { draft: 0, confirmed: 0 };
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      format: row.format,
      charCount: row.charCount,
      status: row.status,
      chunkCount: chunkMap.get(row.id) ?? 0,
      draftCount: counts.draft,
      confirmedCount: counts.confirmed,
      createdAt: row.createdAt,
    };
  });
}

export function getSource(id: string, database: AppDatabase = db) {
  const row = database.select().from(sources).where(eq(sources.id, id)).get();
  if (!row) throw new ApiError(404, "not_found", "资料不存在");
  return row;
}

export function getSourceDetail(id: string, database: AppDatabase = db): SourceDetailDto {
  const source = getSource(id, database);
  const chunkRows = database
    .select()
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, id))
    .orderBy(sourceChunks.seq)
    .all();
  const jobRow = database
    .select()
    .from(jobs)
    .where(sql`json_extract(${jobs.payload}, '$.sourceId') = ${id}`)
    .orderBy(desc(jobs.createdAt))
    .get();
  const counts = methodologyCounts(database, [id]).get(id) ?? { draft: 0, confirmed: 0 };

  return {
    id: source.id,
    title: source.title,
    author: source.author,
    format: source.format,
    originalFilename: source.originalFilename,
    charCount: source.charCount,
    status: source.status,
    error: source.error,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    chunks: chunkRows.map((chunk) => ({
      id: chunk.id,
      seq: chunk.seq,
      title: chunk.title,
      charCount: chunk.charCount,
      extractionStatus: chunk.extractionStatus,
      extractionError: chunk.extractionError,
    })),
    job: jobRow
      ? {
          id: jobRow.id,
          status: jobRow.status,
          stage: jobRow.stage,
          progressDone: jobRow.progressDone,
          progressTotal: jobRow.progressTotal,
          error: jobRow.error,
        }
      : null,
    estimatedTokens: Math.round(source.charCount * TOKEN_ESTIMATE_PER_CHAR),
    draftCount: counts.draft,
    confirmedCount: counts.confirmed,
  };
}

export function getChunkText(
  sourceId: string,
  chunkId: string,
  database: AppDatabase = db,
): SourceChunkTextDto {
  const chunk = database
    .select()
    .from(sourceChunks)
    .where(and(eq(sourceChunks.id, chunkId), eq(sourceChunks.sourceId, sourceId)))
    .get();
  if (!chunk) throw new ApiError(404, "not_found", "章节块不存在");
  return { id: chunk.id, title: chunk.title, text: chunk.text };
}

/** 在 skipped 与 pending 间切换（其余状态不允许，避免覆盖抽取进度）。 */
export function setChunkSkipped(
  sourceId: string,
  chunkId: string,
  skipped: boolean,
  database: AppDatabase = db,
): SourceChunkTextDto {
  const chunk = getChunkText(sourceId, chunkId, database);
  const row = database.select().from(sourceChunks).where(eq(sourceChunks.id, chunkId)).get();
  if (!row) throw new ApiError(404, "not_found", "章节块不存在");
  if (row.extractionStatus !== "skipped" && row.extractionStatus !== "pending") {
    throw new ApiError(409, "invalid_state", "该章节已经开始抽取，无法跳过或恢复");
  }
  database
    .update(sourceChunks)
    .set({ extractionStatus: skipped ? "skipped" : "pending" })
    .where(eq(sourceChunks.id, chunkId))
    .run();
  return chunk;
}

/** 删除资料、章节块、上传文件与它的 draft；confirmed/archived 保留（sourceId 置空）。 */
export async function deleteSource(
  id: string,
  options: SourceServiceOptions = {},
): Promise<{ deleted: true }> {
  const database = options.database ?? db;
  const source = getSource(id, database);
  const filePath = source.filePath;

  database.transaction((tx) => {
    tx.delete(methodologies)
      .where(and(eq(methodologies.sourceId, id), eq(methodologies.status, "draft")))
      .run();
    tx.delete(sources).where(eq(sources.id, id)).run();
  });

  if (filePath) {
    await rm(filePath, { force: true });
  }
  return { deleted: true };
}
