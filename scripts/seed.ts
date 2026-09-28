import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { closeDatabase, db } from "../src/server/db/client";
import { methodologies, methodologyTags, tags } from "../src/server/db/schema";
import { SEED_METHODOLOGIES } from "./seed-data";

/** 写入种子数据：4 个已确认方法论 + 1 个候选方法论（供方法论库审阅界面开发）。 */

const now = Date.now();

// 幂等：清掉上一次写入的种子方法论（methodology_tags 随外键级联删除）。
db.delete(methodologies).where(eq(methodologies.createdBy, "seed")).run();

const tagIds = new Map<string, string>();

function ensureTag(name: string): string {
  const cached = tagIds.get(name);
  if (cached) return cached;
  const existing = db.select().from(tags).where(eq(tags.name, name)).get();
  const id = existing?.id ?? nanoid();
  if (!existing) {
    db.insert(tags).values({ id, name }).run();
  }
  tagIds.set(name, id);
  return id;
}

for (const seed of SEED_METHODOLOGIES) {
  const id = nanoid();
  db.insert(methodologies)
    .values({
      id,
      sourceId: null,
      status: seed.status,
      name: seed.name,
      body: seed.body,
      originChunkIds: [],
      createdBy: "seed",
      mergedIntoId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: seed.status === "confirmed" ? now : null,
    })
    .run();

  for (const tagName of seed.tags) {
    db.insert(methodologyTags)
      .values({ methodologyId: id, tagId: ensureTag(tagName) })
      .run();
  }

  console.log(`✓ ${seed.status === "confirmed" ? "已确认" : "候选"}：${seed.name}（${seed.tags.join("、")}）`);
}

closeDatabase();
console.log(`种子数据写入完成：${SEED_METHODOLOGIES.length} 个方法论。`);
