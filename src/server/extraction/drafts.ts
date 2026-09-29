import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { MethodologyBody } from "@/domain/schemas";
import type { AppDatabase } from "@/server/db/client";
import {
  methodologies,
  methodologyTags,
  tags,
  type MethodologyCreatedBy,
} from "@/server/db/schema";

import { normalizeTagNames } from "./mapping";

/** 候选方法论（draft）与标签的写入辅助；调用方负责事务。 */

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type DbHandle = AppDatabase | Transaction;

/** 按名称查找或新建标签，返回标签 ID（与 names 顺序一致）。 */
function ensureTagIds(handle: DbHandle, names: string[]): string[] {
  return names.map((name) => {
    const existing = handle.select().from(tags).where(eq(tags.name, name)).get();
    if (existing) return existing.id;
    const id = nanoid();
    handle.insert(tags).values({ id, name }).run();
    return id;
  });
}

export function insertDraft(
  handle: DbHandle,
  draft: {
    sourceId: string;
    name: string;
    body: MethodologyBody;
    originChunkIds: string[];
    createdBy: MethodologyCreatedBy;
    tagNames: string[];
  },
): string {
  const id = nanoid();
  const now = Date.now();
  handle
    .insert(methodologies)
    .values({
      id,
      sourceId: draft.sourceId,
      status: "draft",
      name: draft.name.trim(),
      body: draft.body,
      originChunkIds: draft.originChunkIds,
      createdBy: draft.createdBy,
      mergedIntoId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
    })
    .run();
  for (const tagId of ensureTagIds(handle, normalizeTagNames(draft.tagNames))) {
    handle.insert(methodologyTags).values({ methodologyId: id, tagId }).run();
  }
  return id;
}

/** 方法论 ID → 标签名列表。 */
export function tagNamesByMethodology(
  handle: DbHandle,
  methodologyIds: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (methodologyIds.length === 0) return result;
  const rows = handle
    .select({ methodologyId: methodologyTags.methodologyId, name: tags.name })
    .from(methodologyTags)
    .innerJoin(tags, eq(tags.id, methodologyTags.tagId))
    .where(inArray(methodologyTags.methodologyId, methodologyIds))
    .orderBy(tags.name)
    .all();
  for (const row of rows) {
    result.set(row.methodologyId, [...(result.get(row.methodologyId) ?? []), row.name]);
  }
  return result;
}

export function allTagNames(handle: DbHandle): string[] {
  return handle
    .select({ name: tags.name })
    .from(tags)
    .orderBy(tags.name)
    .all()
    .map((row) => row.name);
}
