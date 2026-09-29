import { inArray } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { methodologies, sourceChunks } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { runTask, type TaskContext } from "@/server/llm/run-task";
import { mergeTask, type MergeInput, type MergeOutput } from "@/server/prompts/merge";

import { insertDraft, tagNamesByMethodology } from "./drafts";
import { aiToBody, bodyToAi, normalizeTagNames } from "./mapping";

/** 把一组 draft 合并为新 draft：抽取流水线的高置信组与用户手动合并共用。 */

export type MergeFn = (input: MergeInput, ctx: TaskContext) => Promise<MergeOutput>;

export const runMergeTask: MergeFn = (input, ctx) => runTask(mergeTask, input, ctx);

type MethodologyRow = typeof methodologies.$inferSelect;

/**
 * 合并后原 draft 归档并指向合并结果；摘录在所有来源章节块的并集中重新核对；标签、来源章节块取并集。
 * 合并期间成员若不再是 draft（AI 调用期间被编辑、归档），整个合并放弃并抛 409。
 * 返回新 draft 的 ID。
 */
export async function mergeDrafts(
  database: AppDatabase,
  members: MethodologyRow[],
  merge: MergeFn,
  taskCtx: TaskContext,
): Promise<string> {
  const ids = members.map((m) => m.id);
  const tagsById = tagNamesByMethodology(database, ids);
  const originChunkIds = [...new Set(members.flatMap((m) => m.originChunkIds))];
  const haystacks =
    originChunkIds.length === 0
      ? []
      : database
          .select({ id: sourceChunks.id, text: sourceChunks.text })
          .from(sourceChunks)
          .where(inArray(sourceChunks.id, originChunkIds))
          .all();
  const sourceIds = new Set(members.map((m) => m.sourceId));
  const sourceId = sourceIds.size === 1 ? [...sourceIds][0] : null;

  const merged = await merge(
    { drafts: members.map((m) => bodyToAi(m.body, m.name, tagsById.get(m.id) ?? [])) },
    taskCtx,
  );

  return database.transaction((tx) => {
    const current = tx
      .select({ id: methodologies.id, status: methodologies.status, updatedAt: methodologies.updatedAt })
      .from(methodologies)
      .where(inArray(methodologies.id, ids))
      .all();
    const changed = current.length !== ids.length || current.some((row) => {
      const before = members.find((m) => m.id === row.id);
      return row.status !== "draft" || row.updatedAt !== before?.updatedAt;
    });
    if (changed) {
      throw new ApiError(409, "invalid_state", "参与合并的候选方法论在合并期间发生了变化，请刷新后重试");
    }

    const newId = insertDraft(tx, {
      sourceId,
      name: merged.name,
      body: aiToBody(merged, haystacks),
      originChunkIds,
      createdBy: "merge",
      tagNames: normalizeTagNames([
        ...merged.suggestedTags,
        ...members.flatMap((m) => tagsById.get(m.id) ?? []),
      ]),
    });
    tx.update(methodologies)
      .set({ status: "archived", mergedIntoId: newId, updatedAt: Date.now() })
      .where(inArray(methodologies.id, ids))
      .run();
    return newId;
  });
}
