import { and, eq, ne, sql } from "drizzle-orm";

import { db, type AppDatabase } from "@/server/db/client";
import { methodologies, methodologyTags, tags } from "@/server/db/schema";
import { ensureTagIds, type DbHandle } from "@/server/extraction/drafts";
import { normalizeTagNames } from "@/server/extraction/mapping";

/** 标签：列表（含使用数量）与方法论标签的整体替换。 */

export interface TagDto {
  id: string;
  name: string;
  /** 使用该标签且未归档的方法论数量。 */
  count: number;
}

export function listTags(database: AppDatabase = db): TagDto[] {
  const rows = database
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`count(${methodologies.id})`,
    })
    .from(tags)
    .leftJoin(methodologyTags, eq(methodologyTags.tagId, tags.id))
    .leftJoin(
      methodologies,
      and(eq(methodologies.id, methodologyTags.methodologyId), ne(methodologies.status, "archived")),
    )
    .groupBy(tags.id)
    .orderBy(tags.name)
    .all();
  return rows;
}

/** 用给定的标签名整体替换方法论的标签；不存在的标签自动创建。 */
export function setMethodologyTags(handle: DbHandle, methodologyId: string, names: string[]): void {
  handle.delete(methodologyTags).where(eq(methodologyTags.methodologyId, methodologyId)).run();
  for (const tagId of ensureTagIds(handle, normalizeTagNames(names))) {
    handle.insert(methodologyTags).values({ methodologyId, tagId }).run();
  }
}
