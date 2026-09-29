import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { EXTRACT_CONCURRENCY } from "@/domain/constants";
import type { AppDatabase } from "@/server/db/client";
import {
  jobs,
  methodologies,
  sourceChunks,
  sources,
  type JobStage,
} from "@/server/db/schema";
import { clusterAll, type ClusterGroup } from "@/server/extraction/cluster";
import { allTagNames, insertDraft } from "@/server/extraction/drafts";
import { aiToBody } from "@/server/extraction/mapping";
import { mergeDrafts } from "@/server/extraction/merge-drafts";
import { createMergeSuggestion } from "@/server/extraction/suggestions";
import { runTask, type TaskContext } from "@/server/llm/run-task";
import {
  clusterTask,
  type ClusterInput,
  type ClusterOutput,
} from "@/server/prompts/cluster";
import {
  extractChunkTask,
  type ExtractChunkInput,
  type ExtractChunkOutput,
} from "@/server/prompts/extract-chunk";
import { mergeTask, type MergeInput, type MergeOutput } from "@/server/prompts/merge";

import { describeJobError } from "./errors";
import type { JobContext, JobHandler } from "./runner";

/** `extract_source` 处理器（api-and-ui.md §2.1）：章节抽取 → 去重聚类 → 合并 / 生成合并建议。 */

/** 三个 AI 任务的入口；默认走 runTask，测试可替换为桩。 */
export interface ExtractTasks {
  extractChunk(input: ExtractChunkInput, ctx: TaskContext): Promise<ExtractChunkOutput>;
  cluster(input: ClusterInput, ctx: TaskContext): Promise<ClusterOutput>;
  merge(input: MergeInput, ctx: TaskContext): Promise<MergeOutput>;
}

export const defaultExtractTasks: ExtractTasks = {
  extractChunk: (input, ctx) => runTask(extractChunkTask, input, ctx),
  cluster: (input, ctx) => runTask(clusterTask, input, ctx),
  merge: (input, ctx) => runTask(mergeTask, input, ctx),
};

type MethodologyRow = typeof methodologies.$inferSelect;
type ChunkRow = typeof sourceChunks.$inferSelect;

function updateJob(
  database: AppDatabase,
  jobId: string,
  patch: Partial<{ stage: JobStage; progressDone: number; progressTotal: number }>,
): void {
  database.update(jobs).set(patch).where(eq(jobs.id, jobId)).run();
}

function setSourceStatus(database: AppDatabase, sourceId: string, status: "extracting" | "ready" | "extracted") {
  database
    .update(sources)
    .set({ status, updatedAt: Date.now() })
    .where(eq(sources.id, sourceId))
    .run();
}

/** 收尾时的资料状态：还有待抽取的章节块回到"待抽取"，否则为"已抽取"（失败的块由页面提示重试）。 */
function settleSourceStatus(database: AppDatabase, sourceId: string): void {
  const pending = database
    .select({ count: sql<number>`count(*)` })
    .from(sourceChunks)
    .where(and(eq(sourceChunks.sourceId, sourceId), eq(sourceChunks.extractionStatus, "pending")))
    .get();
  setSourceStatus(database, sourceId, (pending?.count ?? 0) > 0 ? "ready" : "extracted");
}

export function createExtractSourceHandler(tasks: ExtractTasks = defaultExtractTasks): JobHandler {
  return (ctx) => runExtractSource(ctx, tasks);
}

export const extractSourceHandler = createExtractSourceHandler();

export async function runExtractSource(ctx: JobContext, tasks: ExtractTasks): Promise<void> {
  const { job, database, signal } = ctx;
  const { sourceId } = job.payload;
  const source = database.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) throw new Error(`资料 ${sourceId} 不存在`);

  setSourceStatus(database, sourceId, "extracting");
  try {
    await extractChunks(ctx, tasks, source.title, source.author);
    signal.throwIfAborted();
    await dedupe(ctx, tasks);
    updateJob(database, job.id, { stage: "done" });
  } finally {
    settleSourceStatus(database, sourceId);
  }
}

async function extractChunks(
  ctx: JobContext,
  tasks: ExtractTasks,
  sourceTitle: string,
  author: string | null,
): Promise<void> {
  const { job, database, signal } = ctx;
  const { sourceId } = job.payload;

  const chunks = database
    .select()
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId))
    .orderBy(asc(sourceChunks.seq))
    .all();
  let done = chunks.filter((c) => c.extractionStatus === "done").length;
  updateJob(database, job.id, {
    stage: "chunks",
    progressTotal: chunks.filter((c) => c.extractionStatus !== "skipped").length,
    progressDone: done,
  });

  const queue = chunks.filter((c) => c.extractionStatus === "pending" || c.extractionStatus === "failed");

  async function processChunk(chunk: ChunkRow): Promise<void> {
    database
      .update(sourceChunks)
      .set({ extractionStatus: "running", extractionError: null })
      .where(eq(sourceChunks.id, chunk.id))
      .run();
    try {
      const output = await tasks.extractChunk(
        {
          sourceTitle,
          author,
          chunkTitle: chunk.title,
          chunkText: chunk.text,
          existingTags: allTagNames(database),
        },
        { refType: "source_chunk", refId: chunk.id, signal, db: database },
      );

      database.transaction((tx) => {
        // 重试同一章节块时先清掉它此前产生的 draft，保证幂等；已确认或已归档的不动。
        const previous = tx
          .select({ id: methodologies.id, originChunkIds: methodologies.originChunkIds })
          .from(methodologies)
          .where(
            and(
              eq(methodologies.sourceId, sourceId),
              eq(methodologies.createdBy, "extraction"),
              eq(methodologies.status, "draft"),
            ),
          )
          .all()
          .filter((row) => row.originChunkIds.length === 1 && row.originChunkIds[0] === chunk.id);
        if (previous.length > 0) {
          tx.delete(methodologies)
            .where(inArray(methodologies.id, previous.map((row) => row.id)))
            .run();
        }
        for (const ai of output.methodologies) {
          insertDraft(tx, {
            sourceId,
            name: ai.name,
            body: aiToBody(ai, [{ id: chunk.id, text: chunk.text }]),
            originChunkIds: [chunk.id],
            createdBy: "extraction",
            tagNames: ai.suggestedTags,
          });
        }
        tx.update(sourceChunks)
          .set({ extractionStatus: "done", extractionError: null, extractedAt: Date.now() })
          .where(eq(sourceChunks.id, chunk.id))
          .run();
      });
      done += 1;
      updateJob(database, job.id, { progressDone: done });
    } catch (err) {
      const cancelled = signal.aborted;
      database
        .update(sourceChunks)
        .set(
          cancelled
            ? { extractionStatus: "pending", extractionError: null }
            : { extractionStatus: "failed", extractionError: describeJobError(err) },
        )
        .where(eq(sourceChunks.id, chunk.id))
        .run();
    }
  }

  async function worker(): Promise<void> {
    for (let chunk = queue.shift(); chunk && !signal.aborted; chunk = queue.shift()) {
      await processChunk(chunk);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EXTRACT_CONCURRENCY, queue.length) }, () => worker()),
  );
}

async function dedupe(ctx: JobContext, tasks: ExtractTasks): Promise<void> {
  const { job, database, signal } = ctx;
  const { sourceId } = job.payload;
  const taskCtx: TaskContext = { refType: "source", refId: sourceId, signal, db: database };

  const drafts = database
    .select()
    .from(methodologies)
    .where(
      and(
        eq(methodologies.sourceId, sourceId),
        eq(methodologies.status, "draft"),
        inArray(methodologies.createdBy, ["extraction", "merge"]),
      ),
    )
    .orderBy(asc(methodologies.createdAt), sql`rowid`)
    .all();
  if (drafts.length < 2) return;

  updateJob(database, job.id, { stage: "cluster" });
  const chunkTitles = new Map(
    database
      .select({ id: sourceChunks.id, title: sourceChunks.title })
      .from(sourceChunks)
      .where(eq(sourceChunks.sourceId, sourceId))
      .all()
      .map((row) => [row.id, row.title]),
  );
  const items = drafts.map((draft, i) => ({
    ref: `m${i + 1}`,
    name: draft.name,
    summary: draft.body.summary,
    stepTitles: draft.body.steps.map((step) => step.title),
    chunkTitle: chunkTitles.get(draft.originChunkIds[0]) ?? "",
  }));
  const groups = await clusterAll(items, (input) => tasks.cluster(input, taskCtx));
  if (groups.length === 0) return;

  updateJob(database, job.id, { stage: "merge" });
  const byRef = new Map(items.map((item, i) => [item.ref, drafts[i]]));
  for (const group of groups) {
    signal.throwIfAborted();
    const members = group.refs.map((ref) => byRef.get(ref)!);
    if (group.confidence === "high") {
      try {
        await mergeDrafts(database, members, tasks.merge, taskCtx);
        continue;
      } catch (err) {
        if (signal.aborted) throw err;
        console.error("[extract] 自动合并失败，改为合并建议：", err instanceof Error ? err.message : err);
        suggest(database, sourceId, members, `${group.reason}（自动合并失败，请手动确认）`);
      }
    } else {
      suggest(database, sourceId, members, group.reason);
    }
  }
}

function suggest(database: AppDatabase, sourceId: string, members: MethodologyRow[], reason: ClusterGroup["reason"]) {
  createMergeSuggestion(database, {
    sourceId,
    methodologyIds: members.map((m) => m.id),
    reason,
  });
}
