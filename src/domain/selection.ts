import { SELECTION_EPSILON } from "./constants";
import type { Scope } from "./schemas";

/** 选题：范围解析与按掌握度加权随机。 */

export interface ScopeCandidate {
  id: string;
  sourceId: string | null;
  tagIds: string[];
}

/** tagIds ∪ sourceIds ∪ methodologyIds；全空 = 传入的全部（调用方传入已确认方法论）。保持输入顺序。 */
export function resolveScope<T extends ScopeCandidate>(scope: Scope, confirmed: T[]): T[] {
  const tagIds = new Set(scope.tagIds);
  const sourceIds = new Set(scope.sourceIds);
  const methodologyIds = new Set(scope.methodologyIds);
  if (tagIds.size === 0 && sourceIds.size === 0 && methodologyIds.size === 0) return [...confirmed];
  return confirmed.filter(
    (m) =>
      methodologyIds.has(m.id) ||
      (m.sourceId !== null && sourceIds.has(m.sourceId)) ||
      m.tagIds.some((tagId) => tagIds.has(tagId)),
  );
}

/** 权重 w = (1 − mastery) + SELECTION_EPSILON；rng 返回 [0, 1)，可注入以便测试。 */
export function pickWeighted(items: { id: string; mastery: number }[], rng: () => number): string {
  if (items.length === 0) throw new Error("没有可供抽取的方法论");
  const weights = items.map((item) => 1 - item.mastery + SELECTION_EPSILON);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let threshold = rng() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) return items[i].id;
  }
  return items[items.length - 1].id;
}
