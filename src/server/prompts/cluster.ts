import { z } from "zod";

import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";

/** 任务二：去重聚类 `cluster`（llm-and-prompts.md §6）。仅在同一资料内部聚类。 */

export const ClusterOutput = z.object({
  groups: z.array(
    z.object({
      refs: z.array(z.string()).min(2),
      confidence: z.enum(["high", "medium"]),
      reason: z.string(),
    }),
  ),
});
export type ClusterOutput = z.infer<typeof ClusterOutput>;

export interface ClusterItem {
  ref: string;
  name: string;
  summary: string;
  stepTitles: string[];
  chunkTitle: string;
}

export interface ClusterInput {
  items: ClusterItem[];
}

const SCHEMA_DESCRIPTION = `{
  "groups": [
    { "refs": string[],                        // 至少 2 个条目引用，如 ["m1", "m4"]
      "confidence": "high" | "medium",
      "reason": string }
  ]
}`;

const SYSTEM_PROMPT = `下面是从同一本书不同章节抽取出的候选沟通方法论。请找出**描述的是同一个方法论**的条目（同一类情境，且核心步骤大体相同，只是在不同章节被重复讲述或补充）。

- confidence="high"：几乎可以确定是同一方法，合并不会丢失差异。
- confidence="medium"：很可能相同，但情境或步骤有值得用户确认的差异。
- 只是主题相近、但适用情境或核心做法不同的，不要分到一组。
- 每个条目至多出现在一个分组中。
- 没有重复就返回 {"groups": []}。
- reason 用一句话说明为什么认为它们相同（medium 时说明差异点）。

${outputFormatPrompt(SCHEMA_DESCRIPTION)}`;

function build(input: ClusterInput): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ items: input.items }, null, 1) },
  ];
}

function validate(output: ClusterOutput, input: ClusterInput): string[] {
  const known = new Set(input.items.map((item) => item.ref));
  const seen = new Set<string>();
  const errors: string[] = [];
  output.groups.forEach((group, i) => {
    const inGroup = new Set<string>();
    for (const ref of group.refs) {
      if (!known.has(ref)) errors.push(`groups[${i}].refs：引用 ${ref} 不存在`);
      else if (inGroup.has(ref)) errors.push(`groups[${i}].refs：引用 ${ref} 在同一组内重复`);
      else if (seen.has(ref)) errors.push(`groups[${i}].refs：引用 ${ref} 已出现在其他分组中`);
      inGroup.add(ref);
    }
    for (const ref of inGroup) seen.add(ref);
    if (inGroup.size < 2) errors.push(`groups[${i}].refs：一个分组至少要有 2 个不同的条目`);
  });
  return errors;
}

/** Fake 模式：名称完全相同的条目归为一组，confidence=high；其他不分组。 */
function fake(input: ClusterInput): ClusterOutput {
  const byName = new Map<string, string[]>();
  for (const item of input.items) {
    byName.set(item.name, [...(byName.get(item.name) ?? []), item.ref]);
  }
  return {
    groups: [...byName.values()]
      .filter((refs) => refs.length >= 2)
      .map((refs) => ({ refs, confidence: "high" as const, reason: "名称完全相同" })),
  };
}

export const clusterTask: TaskDef<ClusterInput, ClusterOutput> = {
  name: "cluster",
  promptVersion: "cluster@1",
  temperature: 0.1,
  schema: ClusterOutput,
  build,
  validate,
  fake,
};
