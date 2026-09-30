import type { Scope } from "./schemas";

/** 选题：范围解析与均匀随机。 */

export interface ScopeCandidate {
  id: string;
  sourceId: string | null;
  tagIds: string[];
}

/**
 * 标签全部命中，资料可选其一（资料只有一个，无法再取交集）；两者之间取交集。
 * 全空 = 传入的全部（调用方传入已确认方法论）。保持输入顺序。
 */
export function resolveScope<T extends ScopeCandidate>(scope: Scope, confirmed: T[]): T[] {
  const tagIds = new Set(scope.tagIds);
  const sourceIds = new Set(scope.sourceIds);
  if (tagIds.size === 0 && sourceIds.size === 0) return [...confirmed];
  return confirmed.filter(
    (m) =>
      [...tagIds].every((tagId) => m.tagIds.includes(tagId)) &&
      (sourceIds.size === 0 || (m.sourceId !== null && sourceIds.has(m.sourceId))),
  );
}

/** 在候选池中均匀抽取；rng 返回 [0, 1)，可注入以便测试。 */
export function pickRandom<T>(items: T[], rng: () => number): T {
  if (items.length === 0) throw new Error("没有可供抽取的方法论");
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}
