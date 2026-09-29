import { z } from "zod";

import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";

/** 任务一：章节抽取 `extract_chunk`。 */

const AiNode = { excerpt: z.string().nullable(), inferred: z.boolean() };
const AiItem = z.object({ text: z.string().min(1), ...AiNode });
const AiStep = z.object({
  title: z.string().min(1),
  description: z.string(),
  conditional: z.boolean(),
  trigger: z.string().nullable(),
  keyPoints: z.array(AiItem).min(1).max(4),
  exampleLines: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  ...AiNode,
});
const AiPrinciple = z.object({
  kind: z.enum(["do", "dont"]),
  text: z.string().min(1),
  ...AiNode,
});
const AiConcept = z.object({
  name: z.string(),
  explanation: z.string(),
  relatedStepIndexes: z.array(z.number().int()),
  ...AiNode,
});

export const AiMethodology = z.object({
  name: z.string().min(1),
  summary: z.string(),
  goal: z.string(),
  applicability: z.array(AiItem).min(1),
  counterIndications: z.array(AiItem),
  orderMode: z.enum(["strict", "loose"]),
  steps: z.array(AiStep).min(1),
  principles: z.array(AiPrinciple),
  concepts: z.array(AiConcept),
  suggestedTags: z.array(z.string()).min(1).max(3),
});
export type AiMethodology = z.infer<typeof AiMethodology>;

export const ExtractChunkOutput = z.object({ methodologies: z.array(AiMethodology) });
export type ExtractChunkOutput = z.infer<typeof ExtractChunkOutput>;

export interface ExtractChunkInput {
  sourceTitle: string;
  author: string | null;
  chunkTitle: string;
  chunkText: string;
  existingTags: string[];
}

/** 方法论结构的字段说明；抽取与合并任务共用，须与 `AiMethodology` 同步。 */
export const AI_METHODOLOGY_DESCRIPTION = `{
  "name": string,                       // 方法论名称
  "summary": string,
  "goal": string,
  "applicability": Item[],              // 适用条件，至少 1 条
  "counterIndications": Item[],         // 反例（不适用的情境）
  "orderMode": "strict" | "loose",
  "steps": Step[],                      // 至少 1 个
  "principles": Principle[],
  "concepts": Concept[],
  "suggestedTags": string[]             // 1–3 个标签
}
Item = { "text": string, "excerpt": string?, "inferred": boolean }
Step = {
  "title": string, "description": string,
  "conditional": boolean, "trigger": string?,   // conditional=true 时 trigger 必填
  "keyPoints": Item[],                          // 1–4 个
  "exampleLines": string[], "commonMistakes": string[],
  "excerpt": string?, "inferred": boolean
}
Principle = { "kind": "do" | "dont", "text": string, "excerpt": string?, "inferred": boolean }
Concept = { "name": string, "explanation": string, "relatedStepIndexes": number[], "excerpt": string?, "inferred": boolean }`;

const SCHEMA_DESCRIPTION = `{
  "methodologies": Methodology[]   // 本章没有方法论时为空数组
}
Methodology =
${AI_METHODOLOGY_DESCRIPTION}`;

/** 抽取与合并输出共用的语义校验；`path` 是错误信息中的路径前缀，如 `methodologies[0]`，根对象传空串。 */
export function validateAiMethodology(m: AiMethodology, path: string): string[] {
  const errors: string[] = [];
  const prefix = path ? `${path}.` : "";
  const checkNode = (node: { excerpt: string | null; inferred: boolean }, at: string) => {
    if (node.inferred && node.excerpt !== null) {
      errors.push(`${at}：inferred 为 true 时 excerpt 必须为 null`);
    }
  };

  m.applicability.forEach((item, i) => checkNode(item, `${prefix}applicability[${i}]`));
  m.counterIndications.forEach((item, i) => checkNode(item, `${prefix}counterIndications[${i}]`));
  m.steps.forEach((step, i) => {
    const at = `${prefix}steps[${i}]`;
    checkNode(step, at);
    if (step.conditional && !step.trigger?.trim()) {
      errors.push(`${at}：conditional 为 true 时必须填写 trigger`);
    }
    step.keyPoints.forEach((kp, j) => checkNode(kp, `${at}.keyPoints[${j}]`));
  });
  m.principles.forEach((p, i) => checkNode(p, `${prefix}principles[${i}]`));
  m.concepts.forEach((c, i) => {
    const at = `${prefix}concepts[${i}]`;
    checkNode(c, at);
    for (const index of c.relatedStepIndexes) {
      if (index < 0 || index >= m.steps.length) {
        errors.push(`${at}.relatedStepIndexes：下标 ${index} 超出步骤范围（0–${m.steps.length - 1}）`);
      }
    }
  });
  if (!m.steps.some((step) => !step.conditional)) {
    errors.push(`${prefix}steps：至少需要一个非条件步骤`);
  }
  return errors;
}

function systemPrompt(existingTags: string[]): string {
  const tags = existingTags.length > 0 ? existingTags.join("、") : "（暂无）";
  return `你是一名沟通方法论整理专家。你的任务是从一本书的某个章节中，抽取"可执行的沟通方法论"，整理成结构化骨架，供用户后续做情景练习。

【什么算方法论】
- 针对某一类具体沟通情境（如向领导提加薪、安慰情绪低落的伴侣、拒绝同事的额外请求），给出了可以照着做的步骤或做法。
- 纯粹的故事、观点、理论阐述、心态鼓励，如果没有可执行的做法，不要抽取。
- 本章没有方法论时，返回 {"methodologies": []}。不要为了有输出而编造。
- 同一章节中针对不同情境的做法，拆成不同的方法论。

【字段要求】
- name：简短、具体，体现情境，如"向领导提加薪"、"先共情再建议的安慰法"。
- summary：一两句话概括。goal：使用该方法要达成的沟通结果。
- applicability：适用条件，描述情境特征（关系、时机、对方状态、前提），不写做法。
- counterIndications：不适用的情境特征。
- steps：按原文顺序列出。每个步骤 1–4 个要点（keyPoints）。
  - 要点必须"可观察、可评判"：描述在对话中说了/做了什么，例如"用具体数字说明过去一年的成果"；不要写"保持自信"这类无法从对话中判断的描述。
  - conditional：只有当对方出现特定反应时才需要执行的步骤（如"对方拒绝时，询问达到加薪需要满足的条件与时间"），设为 true，并在 trigger 中写明触发的对方反应。至少要有一个非条件步骤。
  - exampleLines：原文中的示例话术，或贴合原文的示例；commonMistakes：常见错误。
- orderMode：原文明确强调先后顺序（如"先……再……最后……"）为 "strict"，否则为 "loose"。
- principles：贯穿全程、不分先后的要求（kind="do"）或禁忌（kind="dont"）。
- concepts：支撑该方法的原理或术语（如"锚定效应"），relatedStepIndexes 为相关步骤的下标（从 0 开始）。
- suggestedTags：1–3 个生活领域标签，优先从已有标签中选择：${tags}；没有合适的再新建，标签用 2–4 个字。

【忠于原文】
- excerpt 必须是从章节原文中**逐字复制**的连续片段，10–120 字，不得改写、拼接、省略；原文是英文则保留英文。
- 原文没有明说、但为了骨架完整而补充的内容（常见于 applicability、counterIndications、principles），设 inferred=true 且 excerpt=null。
- 除 excerpt 外，所有字段用简体中文书写；原文为外文时翻译为中文。

${outputFormatPrompt(SCHEMA_DESCRIPTION)}`;
}

function build(input: ExtractChunkInput): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(input.existingTags) },
    {
      role: "user",
      content: `书名：${input.sourceTitle}　作者：${input.author ?? "未知"}
章节：${input.chunkTitle}
<chapter>
${input.chunkText}
</chapter>`,
    },
  ];
}

/** Fake 模式：正文不足 200 字返回空；否则返回一个带条件步骤的示例方法论，摘录取正文开头（保证精确命中）。 */
const FAKE_MIN_CHARS = 200;
const FAKE_EXCERPT_CHARS = 30;

function fake(input: ExtractChunkInput): ExtractChunkOutput {
  const text = input.chunkText.trim();
  if (text.length < FAKE_MIN_CHARS) return { methodologies: [] };

  const excerpt = text.slice(0, FAKE_EXCERPT_CHARS);
  const grounded = { excerpt, inferred: false };
  const inferred = { excerpt: null, inferred: true };
  return {
    methodologies: [
      {
        name: `示例方法论：${input.chunkTitle}`,
        summary: "Fake 模式生成的示例方法论。",
        goal: "达成一次有效的沟通。",
        applicability: [{ text: "需要就某件事与对方达成一致的场合", ...inferred }],
        counterIndications: [],
        orderMode: "loose",
        steps: [
          {
            title: "说明来意",
            description: "先讲清楚这次沟通的目的。",
            conditional: false,
            trigger: null,
            keyPoints: [
              { text: "开场先说明沟通目的", ...grounded },
              { text: "用一句话概括你的诉求", ...grounded },
            ],
            exampleLines: ["我想和你聊聊这件事。"],
            commonMistakes: ["开场绕圈子"],
            ...grounded,
          },
          {
            title: "应对异议",
            description: "对方提出异议时，先弄清原因。",
            conditional: true,
            trigger: "对方提出异议",
            keyPoints: [
              { text: "先复述对方的顾虑", ...grounded },
              { text: "询问对方能接受的条件", ...grounded },
            ],
            exampleLines: [],
            commonMistakes: [],
            ...grounded,
          },
        ],
        principles: [{ kind: "do", text: "保持尊重的语气", ...inferred }],
        concepts: [],
        suggestedTags: [input.existingTags[0] ?? "职场"],
      },
    ],
  };
}

export const extractChunkTask: TaskDef<ExtractChunkInput, ExtractChunkOutput> = {
  name: "extract_chunk",
  promptVersion: "extract_chunk@1",
  temperature: 0.2,
  schema: ExtractChunkOutput,
  build,
  validate: (output) =>
    output.methodologies.flatMap((m, i) => validateAiMethodology(m, `methodologies[${i}]`)),
  fake,
};
