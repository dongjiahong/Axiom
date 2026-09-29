import { CLUSTER_BATCH_OVERLAP, CLUSTER_BATCH_SIZE } from "@/domain/constants";
import type { ClusterInput, ClusterItem, ClusterOutput } from "@/server/prompts/cluster";

/** 去重聚类的分批与结果合并。 */

export type ClusterGroup = ClusterOutput["groups"][number];

/** 相邻批次重叠 CLUSTER_BATCH_OVERLAP 条，使跨批的重复条目有机会落在同一批。 */
export function splitIntoBatches<T>(items: T[]): T[][] {
  if (items.length <= CLUSTER_BATCH_SIZE) return [items];
  const stride = CLUSTER_BATCH_SIZE - CLUSTER_BATCH_OVERLAP;
  const batches: T[][] = [];
  for (let start = 0; ; start += stride) {
    batches.push(items.slice(start, start + CLUSTER_BATCH_SIZE));
    if (start + CLUSTER_BATCH_SIZE >= items.length) break;
  }
  return batches;
}

/** 对有交集的组取并集；任一组为 medium 则整组为 medium。 */
export function unionGroups(groups: ClusterGroup[]): ClusterGroup[] {
  const parent = new Map<string, string>();
  const find = (ref: string): string => {
    let root = ref;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(ref, root);
    return root;
  };
  for (const group of groups) {
    for (const ref of group.refs) if (!parent.has(ref)) parent.set(ref, ref);
    const [head, ...others] = group.refs;
    for (const ref of others) parent.set(find(ref), find(head));
  }

  const merged = new Map<string, ClusterGroup>();
  for (const group of groups) {
    const root = find(group.refs[0]);
    const existing = merged.get(root);
    if (!existing) {
      merged.set(root, { ...group, refs: [...group.refs] });
      continue;
    }
    for (const ref of group.refs) if (!existing.refs.includes(ref)) existing.refs.push(ref);
    if (group.confidence === "medium") existing.confidence = "medium";
    if (!existing.reason.includes(group.reason)) existing.reason = `${existing.reason}；${group.reason}`;
  }
  return [...merged.values()];
}

export async function clusterAll(
  items: ClusterItem[],
  runBatch: (input: ClusterInput) => Promise<ClusterOutput>,
): Promise<ClusterGroup[]> {
  const groups: ClusterGroup[] = [];
  for (const batch of splitIntoBatches(items)) {
    groups.push(...(await runBatch({ items: batch })).groups);
  }
  return unionGroups(groups);
}
