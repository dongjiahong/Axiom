import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { mergeSuggestions } from "@/server/db/schema";

import type { DbHandle } from "./drafts";

/**
 * 写入一条合并建议（状态 open）。
 * 同一资料下成员完全相同的建议（含已忽略的）不重复创建，避免重试抽取时反复提示。
 * 返回新建的 ID；已存在时返回 null。
 */
export function createMergeSuggestion(
  handle: DbHandle,
  suggestion: { sourceId: string; methodologyIds: string[]; reason: string },
): string | null {
  const key = (ids: string[]) => [...ids].sort().join("|");
  const wanted = key(suggestion.methodologyIds);
  const existing = handle
    .select({ methodologyIds: mergeSuggestions.methodologyIds })
    .from(mergeSuggestions)
    .where(eq(mergeSuggestions.sourceId, suggestion.sourceId))
    .all();
  if (existing.some((row) => key(row.methodologyIds) === wanted)) return null;

  const id = nanoid();
  handle
    .insert(mergeSuggestions)
    .values({
      id,
      sourceId: suggestion.sourceId,
      methodologyIds: suggestion.methodologyIds,
      reason: suggestion.reason,
      status: "open",
      createdAt: Date.now(),
    })
    .run();
  return id;
}
