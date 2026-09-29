import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";
import { AI_METHODOLOGY_DESCRIPTION, AiMethodology, validateAiMethodology } from "./extract-chunk";

/** 任务三：合并 `merge`（llm-and-prompts.md §7）。输出与抽取任务里的单个方法论同一结构。 */

export interface MergeInput {
  drafts: AiMethodology[];
}

export type MergeOutput = AiMethodology;

const SYSTEM_PROMPT = `下面是被判定为同一沟通方法论的多个版本。请把它们合并为一个完整、不重复的方法论骨架。

- 取并集：保留所有不重复的步骤、要点、原则、概念、示例话术与常见错误；意思相同的只保留表述更具体的一条。
- 步骤顺序以最完整的版本为准；orderMode 任一版本为 strict 则为 strict。
- excerpt 只能从输入中已有的 excerpt 原样复制，不得新造；inferred 标记保持与来源一致。
- name 选最能体现情境的一个，必要时重写得更具体。
- 每个步骤最多 4 个要点；超过时保留最重要、最可评判的。至少保留一个非条件步骤。
- concepts 的 relatedStepIndexes 是合并后 steps 的下标（从 0 开始）。

${outputFormatPrompt(AI_METHODOLOGY_DESCRIPTION)}`;

function build(input: MergeInput): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ drafts: input.drafts }, null, 1) },
  ];
}

const MAX_KEY_POINTS = 4;

/** Fake 模式：以第一个草稿为基础，把其他草稿中文本不重复的要点、步骤、原则追加进来。 */
function fake(input: MergeInput): MergeOutput {
  const [first, ...rest] = input.drafts;
  const merged: AiMethodology = structuredClone(first);
  for (const draft of rest) {
    for (const step of draft.steps) {
      const existing = merged.steps.find((s) => s.title === step.title);
      if (!existing) {
        merged.steps.push(structuredClone(step));
        continue;
      }
      for (const kp of step.keyPoints) {
        if (existing.keyPoints.length >= MAX_KEY_POINTS) break;
        if (!existing.keyPoints.some((k) => k.text === kp.text)) existing.keyPoints.push(kp);
      }
    }
    for (const principle of draft.principles) {
      if (!merged.principles.some((p) => p.text === principle.text)) merged.principles.push(principle);
    }
    for (const tag of draft.suggestedTags) {
      if (merged.suggestedTags.length < 3 && !merged.suggestedTags.includes(tag)) {
        merged.suggestedTags.push(tag);
      }
    }
  }
  return merged;
}

export const mergeTask: TaskDef<MergeInput, MergeOutput> = {
  name: "merge",
  promptVersion: "merge@1",
  temperature: 0.2,
  schema: AiMethodology,
  build,
  validate: (output) => validateAiMethodology(output, ""),
  fake,
};
