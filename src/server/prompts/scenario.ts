import { z } from "zod";

import {
  RESISTANCE_COUNT_RANGE,
  SCENARIO_LEAK_MIN_STEP_TITLE_CHARS,
} from "@/domain/constants";
import type { Difficulty, MethodologyBody, PracticeMode } from "@/domain/schemas";
import { normalize } from "@/domain/text-match";
import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";

/** 任务四：场景生成 `scenario`。 */

export interface ScenarioInput {
  mode: PracticeMode;
  difficulty: Difficulty;
  target: {
    name: string;
    summary: string;
    goal: string;
    applicability: string[];
    counterIndications: string[];
    steps: { ref: string; title: string; conditional: boolean; trigger: string | null }[];
    principles: string[];
  };
  /** 范围内其余已确认方法论。 */
  others: {
    ref: string;
    name: string;
    applicability: string[];
    counterIndications: string[];
  }[];
  /** 该目标方法论最近的场景标题，避免重复。 */
  recentTitles: string[];
}

export const ScenarioOutput = z.object({
  title: z.string().min(1),
  background: z.string().min(1),
  userRole: z.string().min(1),
  userGoal: z.string().min(1),
  counterpart: z.object({
    name: z.string().min(1),
    relation: z.string().min(1),
    profile: z.string().min(1),
  }),
  openingSpeaker: z.enum(["counterpart", "user"]),
  openingLine: z.string().nullable(),
  brief: z.object({
    personality: z.string(),
    trueStance: z.string(),
    hiddenConcerns: z.array(z.string()).min(1),
    plannedResistance: z
      .array(
        z.object({
          trigger: z.string(),
          reaction: z.string(),
          linkedStepRef: z.string().nullable(),
        }),
      )
      .min(1),
    yieldConditions: z.string(),
    breakdownConditions: z.string(),
  }),
  alternatives: z.array(z.object({ ref: z.string(), reason: z.string() })),
  designNotes: z.string(),
});
export type ScenarioOutput = z.infer<typeof ScenarioOutput>;

// ───────────── 短引用 ─────────────

export const stepRef = (index: number) => `s${index + 1}`;
export const methodologyRef = (index: number) => `m${index + 1}`;

interface MethodologyLike {
  name: string;
  body: MethodologyBody;
}

/** 由方法论正文构造任务输入；步骤引用 `s1..`，其余方法论引用 `m1..`（顺序即 others 的顺序）。 */
export function buildScenarioInput(params: {
  mode: PracticeMode;
  difficulty: Difficulty;
  target: MethodologyLike;
  others: MethodologyLike[];
  recentTitles: string[];
}): ScenarioInput {
  const { target, others } = params;
  return {
    mode: params.mode,
    difficulty: params.difficulty,
    target: {
      name: target.name,
      summary: target.body.summary,
      goal: target.body.goal,
      applicability: target.body.applicability.map((item) => item.text),
      counterIndications: target.body.counterIndications.map((item) => item.text),
      steps: target.body.steps.map((step, i) => ({
        ref: stepRef(i),
        title: step.title,
        conditional: step.conditional,
        trigger: step.trigger,
      })),
      principles: target.body.principles.map((p) => p.text),
    },
    others: others.map((m, i) => ({
      ref: methodologyRef(i),
      name: m.name,
      applicability: m.body.applicability.map((item) => item.text),
      counterIndications: m.body.counterIndications.map((item) => item.text),
    })),
    recentTitles: params.recentTitles,
  };
}

// ───────────── 提示词 ─────────────

const SCHEMA_DESCRIPTION = `{
  "title": string,                        // 场景标题，不含方法论名称
  "background": string,                   // 第二人称"你"，150–300 字
  "userRole": string,
  "userGoal": string,                     // 只写想达成什么，不写怎么做
  "counterpart": { "name": string, "relation": string, "profile": string },
  "openingSpeaker": "counterpart" | "user",
  "openingLine": string?,                 // openingSpeaker="counterpart" 时必填，否则为 null
  "brief": {                              // 对方角色卡（用户看不到）
    "personality": string,
    "trueStance": string,
    "hiddenConcerns": string[],           // 至少 1 条
    "plannedResistance": {                // 至少 1 条，数量随难度
      "trigger": string, "reaction": string,
      "linkedStepRef": string?            // 目标方法论中条件步骤的引用（如 "s3"），无对应时为 null
    }[],
    "yieldConditions": string,
    "breakdownConditions": string
  },
  "alternatives": { "ref": string, "reason": string }[],   // ref 来自 others 中的引用（如 "m2"）；没有则为空数组
  "designNotes": string                   // 为什么目标方法论最适合这个场景
}`;

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  cooperative: "配合（cooperative）：对方友善开放，阻力 1–2 条且温和，用户基本按要点去做就能达成。",
  neutral:
    "一般（neutral）：对方有自己的立场和顾虑，阻力 2–3 条，用户需要较完整地执行要点对方才会让步。",
  tough:
    "强硬（tough）：对方强势、忙碌或情绪化，阻力 3–5 条，会反复施压、质疑或转移话题；只有高质量执行才可能换来部分让步。",
};

function systemPrompt(input: ScenarioInput): string {
  const quiz = input.mode === "quiz";
  const recent =
    input.recentTitles.length > 0 ? input.recentTitles.map((t) => `「${t}」`).join("、") : "（暂无）";
  const principles = [
    "1. 场景必须满足目标方法论的适用条件，且不落入它的反例。",
    ...(quiz
      ? [
          "2. 这是综合测验，用户看不到目标方法论，要自己判断该用哪个方法。请让场景特征能区分目标方法论与其他候选方法论：尽量让其他候选的适用条件不满足、或落入它们的反例。确实同样适用的候选，列入 alternatives 并说明理由；不要滥标。",
        ]
      : []),
    `${quiz ? 3 : 2}. 可见内容（title、background、userRole、userGoal、counterpart、openingLine）中不得出现任何方法论的名称、步骤名称，也不得暗示做法（如"你应该先认同对方"）。userGoal 只写想达成什么，不写怎么做。`,
    `${quiz ? 4 : 3}. background 用第二人称"你"，150–300 字，写清人物关系、事件经过、利害得失和此刻的情境，细节具体、贴近中国职场与生活。`,
    `${quiz ? 5 : 4}. 避免与这些已有场景雷同：${recent}`,
  ];
  return `你是沟通训练的情景设计师。请根据"目标方法论"设计一个练习场景：用户将扮演场景中的"你"，与由 AI 扮演的对方进行多轮对话。

【设计原则】
${principles.join("\n")}

【对方角色卡（用户看不到）】
- personality、trueStance（真实立场）、hiddenConcerns（2–4 个不会主动说出的顾虑）。
- plannedResistance：预先设计的阻力，每条写清 trigger（用户做了/没做什么时触发）与 reaction（对方怎么说、怎么做）。目标方法论的条件步骤需要对方的特定反应才会被练到，请用阻力去制造这些反应，并用 linkedStepRef 标注对应的条件步骤（引用形如 s3）。
- yieldConditions：用户做到什么程度对方才会让步；breakdownConditions：什么情况下对方会拒绝到底或谈崩。
- openingSpeaker 为 counterpart 时，openingLine 是对方的开场白（口语、1–3 句）；为 user 时 openingLine 为 null。

【难度：${DIFFICULTY_TEXT[input.difficulty]}】

【designNotes】说明为什么目标方法论最适合这个场景${quiz ? "，以及它与最容易混淆的候选方法论的区别" : ""}。这段内容在复盘时展示给用户。

${outputFormatPrompt(SCHEMA_DESCRIPTION)}`;
}

function build(input: ScenarioInput): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(input) },
    {
      role: "user",
      content: JSON.stringify({ target: input.target, others: input.others }, null, 1),
    },
  ];
}

// ───────────── 语义校验 ─────────────

function visibleFields(output: ScenarioOutput): [label: string, value: string][] {
  return [
    ["title", output.title],
    ["background", output.background],
    ["userRole", output.userRole],
    ["userGoal", output.userGoal],
    ["counterpart.name", output.counterpart.name],
    ["counterpart.relation", output.counterpart.relation],
    ["counterpart.profile", output.counterpart.profile],
    ["openingLine", output.openingLine ?? ""],
  ];
}

export function validateScenario(output: ScenarioOutput, input: ScenarioInput): string[] {
  const errors: string[] = [];

  if (output.openingSpeaker === "counterpart") {
    if (!output.openingLine?.trim()) errors.push("openingSpeaker 为 counterpart 时 openingLine 不能为空");
  } else if (output.openingLine !== null) {
    errors.push("openingSpeaker 为 user 时 openingLine 必须为 null");
  }

  // 阻力：关联的必须是目标方法论的条件步骤；数量随难度
  const steps = new Map(input.target.steps.map((step) => [step.ref, step]));
  const conditionalRefs = input.target.steps.filter((s) => s.conditional).map((s) => s.ref);
  const linked = new Set<string>();
  output.brief.plannedResistance.forEach((resistance, i) => {
    const ref = resistance.linkedStepRef;
    if (ref === null) return;
    const step = steps.get(ref);
    if (!step) {
      errors.push(`brief.plannedResistance[${i}].linkedStepRef：「${ref}」不是目标方法论的步骤引用`);
    } else if (!step.conditional) {
      errors.push(`brief.plannedResistance[${i}].linkedStepRef：「${ref}」不是条件步骤，只能关联条件步骤`);
    } else {
      linked.add(ref);
    }
  });

  const range = RESISTANCE_COUNT_RANGE[input.difficulty];
  const count = output.brief.plannedResistance.length;
  if (count < range.min || count > range.max) {
    errors.push(
      `难度为 ${input.difficulty} 时 brief.plannedResistance 应有 ${range.min}–${range.max} 条，当前为 ${count} 条`,
    );
  }
  // 条件步骤多于阻力条数时，不可能全部关联，此时要求每条阻力都关联到不同的条件步骤
  if (input.difficulty !== "cooperative") {
    const required = Math.min(conditionalRefs.length, count);
    if (linked.size < required) {
      const missing = conditionalRefs.filter((ref) => !linked.has(ref));
      errors.push(
        `每个条件步骤都应至少被一条阻力关联，以下条件步骤尚未关联：${missing.join("、")}`,
      );
    }
  }

  const otherRefs = new Set(input.others.map((o) => o.ref));
  output.alternatives.forEach((alt, i) => {
    if (!otherRefs.has(alt.ref)) {
      errors.push(`alternatives[${i}].ref：「${alt.ref}」不在 others 的引用中`);
    }
  });

  // 可见字段不得泄露任何方法论名称或步骤标题
  const forbidden: [label: string, value: string][] = [
    ["目标方法论名称", input.target.name],
    ...input.others.map((o): [string, string] => ["其他方法论名称", o.name]),
    ...input.target.steps
      .filter((s) => normalize(s.title).length >= SCENARIO_LEAK_MIN_STEP_TITLE_CHARS)
      .map((s): [string, string] => ["步骤名称", s.title]),
  ];
  for (const [field, value] of visibleFields(output)) {
    const normalized = normalize(value);
    for (const [label, word] of forbidden) {
      const key = normalize(word);
      if (key && normalized.includes(key)) {
        errors.push(`${field} 中出现了${label}「${word}」，可见内容不得泄露方法论名称或步骤名称`);
      }
    }
  }

  return errors;
}

// ───────────── Fake ─────────────

function fake(input: ScenarioInput): ScenarioOutput {
  const range = RESISTANCE_COUNT_RANGE[input.difficulty];
  const conditional = input.target.steps.filter((s) => s.conditional);
  const linkedSteps = conditional.slice(0, range.max);
  const resistances = linkedSteps.map((step, i) => ({
    trigger: `你在沟通中触发了对方的顾虑（第 ${i + 1} 处）`,
    reaction: "对方表示为难，提出自己的困难并要求你再解释一下。",
    linkedStepRef: step.ref as string | null,
  }));
  while (resistances.length < range.min) {
    resistances.push({
      trigger: "你的表达没有回应对方的关切",
      reaction: "对方显得犹豫，没有立刻答应。",
      linkedStepRef: null,
    });
  }

  const alternative = input.mode === "quiz" ? input.others[0] : undefined;
  return {
    title: `示例场景 ${input.recentTitles.length + 1}`,
    background:
      "你需要和对方谈一件对你很重要的事。你们相识已久，最近双方都比较忙，你决定趁今天有空当面把话说清楚。",
    userRole: "当事人",
    userGoal: "让对方理解你的想法，并就这件事达成一致。",
    counterpart: { name: "小周", relation: "熟悉的同事", profile: "做事认真，说话直接，最近压力不小。" },
    openingSpeaker: "counterpart",
    openingLine: "你找我有事吗？我一会儿还有个会。",
    brief: {
      personality: "谨慎、务实，不喜欢被催促。",
      trueStance: "并不反对，但希望对方先把情况说清楚。",
      hiddenConcerns: ["担心增加自己的负担"],
      plannedResistance: resistances,
      yieldConditions: "对方把事情讲清楚并考虑到自己的处境时会让步。",
      breakdownConditions: "对方态度强硬或回避问题时会拒绝到底。",
    },
    alternatives: alternative
      ? [{ ref: alternative.ref, reason: "该场景同样符合这个方法论的适用条件。" }]
      : [],
    designNotes: "目标方法论的适用条件与本场景一致：双方关系熟悉、事情明确、需要当面沟通。",
  };
}

export const scenarioTask: TaskDef<ScenarioInput, ScenarioOutput> = {
  name: "scenario",
  promptVersion: "scenario@1",
  temperature: 0.9,
  schema: ScenarioOutput,
  build,
  validate: validateScenario,
  fake,
};
