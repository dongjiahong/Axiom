import { z } from "zod";

import { EVIDENCE_QUOTE_CHARS } from "@/domain/constants";
import type { CounterpartBrief, MethodologyBody, MethodologySnapshot } from "@/domain/schemas";
import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";

/** 任务六：复盘 `debrief`。 */

export interface DebriefInput {
  scenario: {
    title: string;
    background: string;
    userRole: string;
    userGoal: string;
    counterpart: { name: string; relation: string; profile: string };
    openingLine: string | null;
    brief: {
      personality: string;
      trueStance: string;
      hiddenConcerns: string[];
      plannedResistance: { id: string; trigger: string; reaction: string }[];
      yieldConditions: string;
      breakdownConditions: string;
    };
    designNotes: string;
  };
  /** 用户所用（即目标）方法论快照，短引用。 */
  selected: {
    name: string;
    goal: string;
    orderMode: "strict" | "loose";
    steps: {
      ref: string;
      title: string;
      description: string;
      conditional: boolean;
      trigger: string | null;
      keyPoints: { ref: string; text: string }[];
    }[];
    principles: { ref: string; kind: "do" | "dont"; text: string }[];
    concepts: { ref: string; name: string; explanation: string }[];
  };
  /** `[第0轮·对方] ……` / `[第1轮·你] ……` 逐行。 */
  transcript: string;
  firedResistance: { id: string; trigger: string; linkedStepTitle: string | null; turns: number[] }[];
  userTurnCount: number;
}

const AiEvidence = z.object({ turn: z.number().int(), quote: z.string().min(1) });

export const DebriefOutput = z.object({
  keyPointVerdicts: z.array(
    z.object({
      ref: z.string(),
      verdict: z.enum(["done", "partial", "missed", "not_triggered"]),
      quality: z.number().int().min(1).max(5).nullable(),
      evidence: z.array(AiEvidence),
      comment: z.string(),
      suggestion: z.string().nullable(),
      rewrite: z
        .object({
          turn: z.number().int(),
          original: z.string(),
          rewrite: z.string(),
          conceptRefs: z.array(z.string()),
        })
        .nullable(),
    }),
  ),
  principleVerdicts: z.array(
    z.object({
      ref: z.string(),
      verdict: z.enum(["kept", "violated"]),
      evidence: z.array(AiEvidence),
      comment: z.string(),
    }),
  ),
  holistic: z.object({ score: z.number().int().min(0).max(100), comment: z.string() }),
  outcome: z.object({
    result: z.enum(["agreed", "partial", "refused", "unresolved"]),
    note: z.string(),
  }),
  summary: z.object({
    strengths: z.array(z.string()).max(3),
    improvements: z.array(z.string()).min(1).max(3),
  }),
});
export type DebriefOutput = z.infer<typeof DebriefOutput>;

// ───────────── 短引用 ─────────────

export interface DebriefRefs {
  steps: { ref: string; stepId: string }[];
  /** 要点引用 k1.. 在整个方法论内连续编号。 */
  keyPoints: Map<string, { stepId: string; keyPointId: string }>;
  principles: Map<string, string>;
  concepts: Map<string, string>;
}

export function buildDebriefRefs(body: MethodologyBody): DebriefRefs {
  const keyPoints = new Map<string, { stepId: string; keyPointId: string }>();
  let k = 0;
  const steps = body.steps.map((step, i) => {
    for (const kp of step.keyPoints) keyPoints.set(`k${++k}`, { stepId: step.id, keyPointId: kp.id });
    return { ref: `s${i + 1}`, stepId: step.id };
  });
  return {
    steps,
    keyPoints,
    principles: new Map(body.principles.map((p, i) => [`p${i + 1}`, p.id])),
    concepts: new Map(body.concepts.map((c, i) => [`c${i + 1}`, c.id])),
  };
}

export function buildSelectedInput(snapshot: MethodologySnapshot): DebriefInput["selected"] {
  const { body } = snapshot;
  let k = 0;
  return {
    name: snapshot.name,
    goal: body.goal,
    orderMode: body.orderMode,
    steps: body.steps.map((step, i) => ({
      ref: `s${i + 1}`,
      title: step.title,
      description: step.description,
      conditional: step.conditional,
      trigger: step.trigger,
      keyPoints: step.keyPoints.map((kp) => ({ ref: `k${++k}`, text: kp.text })),
    })),
    principles: body.principles.map((p, i) => ({ ref: `p${i + 1}`, kind: p.kind, text: p.text })),
    concepts: body.concepts.map((c, i) => ({
      ref: `c${i + 1}`,
      name: c.name,
      explanation: c.explanation,
    })),
  };
}

export function toDebriefScenarioBrief(brief: CounterpartBrief): DebriefInput["scenario"]["brief"] {
  return {
    personality: brief.personality,
    trueStance: brief.trueStance,
    hiddenConcerns: brief.hiddenConcerns,
    plannedResistance: brief.plannedResistance.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      reaction: r.reaction,
    })),
    yieldConditions: brief.yieldConditions,
    breakdownConditions: brief.breakdownConditions,
  };
}

export function buildTranscript(
  messages: { role: "user" | "counterpart"; turn: number; content: string }[],
): string {
  return messages
    .map((m) => `[第${m.turn}轮·${m.role === "user" ? "你" : "对方"}] ${m.content}`)
    .join("\n");
}

// ───────────── 提示词 ─────────────

const SCHEMA_DESCRIPTION = `{
  "keyPointVerdicts": {                   // 每个要点（k 开头的引用）恰好一条
    "ref": string,                        // 如 "k3"
    "verdict": "done" | "partial" | "missed" | "not_triggered",
    "quality": number?,                   // 1–5 的整数；missed / not_triggered 为 null
    "evidence": { "turn": number, "quote": string }[],   // done / partial 至少 1 条；quote 为用户原话的逐字片段
    "comment": string,
    "suggestion": string?,                // done 且 quality=5 时可为 null
    "rewrite": {                          // partial / missed 必须给出，其余为 null
      "turn": number, "original": string, "rewrite": string,
      "conceptRefs": string[]             // 相关概念引用（如 "c1"），可为空数组
    }?
  }[],
  "principleVerdicts": {                  // 每条原则（p 开头的引用）恰好一条
    "ref": string,                        // 如 "p2"
    "verdict": "kept" | "violated",
    "evidence": { "turn": number, "quote": string }[],   // violated 至少 1 条
    "comment": string
  }[],
  "holistic": { "score": number, "comment": string },    // score 为 0–100 的整数
  "outcome": { "result": "agreed" | "partial" | "refused" | "unresolved", "note": string },
  "summary": { "strengths": string[], "improvements": string[] }   // strengths 0–3 条，improvements 1–3 条
}`;

function systemPrompt(input: DebriefInput): string {
  return `你是一位严格、具体、建设性的沟通教练。用户刚完成一场沟通练习，请依据方法论骨架逐项评判。

【评判对象】
用户所用的方法论为「${input.selected.name}」。请对它的**每一个要点**（k 开头的引用）和**每一条原则**（p 开头的引用）各给出一条判定，不能遗漏或重复。

【要点判定】
- done：做到了。partial：有意图但不完整或不到位。missed：该做而没做。
- not_triggered：仅用于条件步骤下的要点，且对话中从未出现该步骤的触发情形（可参考"对方阻力触发记录"与对话原文）。只要触发情形出现过而用户没有应对，就是 missed。
- quality（1–5）：5=自然、完整、时机恰当，可作示范；4=做到且较好；3=做到但生硬或不完整；2=有意图但明显不到位；1=几乎没做到。done 取 3–5，partial 取 1–3，missed 与 not_triggered 为 null。
- evidence：done 与 partial 必须引用用户原话。turn 为轮次，quote 为从该轮"你"的发言中**逐字复制**的片段（${EVIDENCE_QUOTE_CHARS.min}–${EVIDENCE_QUOTE_CHARS.max} 字），不能引用对方的话，不能改写。
- comment：具体说明做得怎么样，好在哪里或差在哪里，结合对话内容。
- suggestion：一句话说明下次可以怎么做（done 且 quality=5 时可为 null）。
- rewrite：partial 与 missed 必须给出。turn 为最适合改进的那一轮；original 为用户该轮原话（若该轮本就不该这样说，也照抄原话）；rewrite 为符合场景口吻、可以直接说出口的建议说法；conceptRefs 为相关概念引用（可为空）。

【原则判定】kept 或 violated；violated 必须引用原话作为 evidence。

【其他】
- holistic：0–100 的整体印象分，综合自然度、情绪把控、关系维护，并用一两句话说明。
- outcome：对方最终的态度，agreed（答应）/ partial（部分让步）/ refused（拒绝）/ unresolved（未有结论），note 一句话说明。
- 执行判定与说服结果相互独立：不要因为对方答应了就放宽判定，也不要因为对方拒绝就收紧判定。
- summary：strengths 为 0–3 条做得好的地方；improvements 为 1–3 条最重要的改进点，最重要的放在最前面。

${outputFormatPrompt(SCHEMA_DESCRIPTION)}`;
}

function userPrompt(input: DebriefInput): string {
  const sections = [
    ["场景（含对方角色卡与设计说明）", JSON.stringify(input.scenario, null, 1)],
    ["方法论骨架", JSON.stringify(input.selected, null, 1)],
    [
      "对方阻力触发记录",
      input.firedResistance.length > 0 ? JSON.stringify(input.firedResistance, null, 1) : "（对方没有触发任何计划阻力）",
    ],
    ["对话原文（用户共 " + input.userTurnCount + " 轮）", input.transcript],
  ];
  return sections.map(([title, content]) => `## ${title}\n${content}`).join("\n\n");
}

function build(input: DebriefInput): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(input) },
    { role: "user", content: userPrompt(input) },
  ];
}

// ───────────── 语义校验 ─────────────

export function validateDebrief(output: DebriefOutput, input: DebriefInput): string[] {
  const errors: string[] = [];
  const maxTurn = input.userTurnCount;

  const conditionalKeyPointRefs = new Set(
    input.selected.steps.filter((s) => s.conditional).flatMap((s) => s.keyPoints.map((k) => k.ref)),
  );
  const allKeyPointRefs = new Set(input.selected.steps.flatMap((s) => s.keyPoints.map((k) => k.ref)));
  const allPrincipleRefs = new Set(input.selected.principles.map((p) => p.ref));
  const conceptRefs = new Set(input.selected.concepts.map((c) => c.ref));

  const checkTurn = (path: string, turn: number) => {
    if (turn < 1 || turn > maxTurn) errors.push(`${path}：轮次 ${turn} 不在 1–${maxTurn} 范围内`);
  };

  const seenKeyPoints = new Set<string>();
  output.keyPointVerdicts.forEach((v, i) => {
    const path = `keyPointVerdicts[${i}]`;
    if (!allKeyPointRefs.has(v.ref)) errors.push(`${path}.ref：「${v.ref}」不是已知的要点引用`);
    else if (seenKeyPoints.has(v.ref)) errors.push(`${path}.ref：要点「${v.ref}」重复出现`);
    seenKeyPoints.add(v.ref);

    if (v.verdict === "not_triggered" && allKeyPointRefs.has(v.ref) && !conditionalKeyPointRefs.has(v.ref)) {
      errors.push(`${path}：「${v.ref}」不在条件步骤下，不能判为 not_triggered`);
    }
    if ((v.verdict === "done" || v.verdict === "partial") && v.evidence.length === 0) {
      errors.push(`${path}.evidence：判为 ${v.verdict} 时至少需要一条用户原话作为证据`);
    }
    v.evidence.forEach((e, j) => checkTurn(`${path}.evidence[${j}].turn`, e.turn));
    if ((v.verdict === "partial" || v.verdict === "missed") && !v.rewrite) {
      errors.push(`${path}.rewrite：判为 ${v.verdict} 时必须给出示范改写`);
    }
    if (v.rewrite) {
      checkTurn(`${path}.rewrite.turn`, v.rewrite.turn);
      v.rewrite.conceptRefs.forEach((ref, j) => {
        if (!conceptRefs.has(ref)) errors.push(`${path}.rewrite.conceptRefs[${j}]：「${ref}」不是已知的概念引用`);
      });
    }
  });
  for (const ref of allKeyPointRefs) {
    if (!seenKeyPoints.has(ref)) errors.push(`keyPointVerdicts：缺少要点「${ref}」的判定`);
  }

  const seenPrinciples = new Set<string>();
  output.principleVerdicts.forEach((v, i) => {
    const path = `principleVerdicts[${i}]`;
    if (!allPrincipleRefs.has(v.ref)) errors.push(`${path}.ref：「${v.ref}」不是已知的原则引用`);
    else if (seenPrinciples.has(v.ref)) errors.push(`${path}.ref：原则「${v.ref}」重复出现`);
    seenPrinciples.add(v.ref);
    if (v.verdict === "violated" && v.evidence.length === 0) {
      errors.push(`${path}.evidence：判为 violated 时至少需要一条用户原话作为证据`);
    }
    v.evidence.forEach((e, j) => checkTurn(`${path}.evidence[${j}].turn`, e.turn));
  });
  for (const ref of allPrincipleRefs) {
    if (!seenPrinciples.has(ref)) errors.push(`principleVerdicts：缺少原则「${ref}」的判定`);
  }

  return errors;
}

// ───────────── Fake ─────────────

const FAKE_QUOTE_CHARS = 10;
const FAKE_HOLISTIC_SCORE = 70;

function firstUserMessage(transcript: string): string {
  const match = /^\[第1轮·你\] (.*)$/m.exec(transcript);
  return match?.[1] ?? "";
}

function fake(input: DebriefInput): DebriefOutput {
  const quote = firstUserMessage(input.transcript).slice(0, FAKE_QUOTE_CHARS);
  const regular = input.selected.steps.filter((s) => !s.conditional).flatMap((s) => s.keyPoints);
  const doneCount = Math.ceil(regular.length / 2);
  const doneRefs = new Set(regular.slice(0, doneCount).map((k) => k.ref));

  const keyPointVerdicts: DebriefOutput["keyPointVerdicts"] = input.selected.steps.flatMap((step) =>
    step.keyPoints.map((kp) => {
      if (step.conditional) {
        return {
          ref: kp.ref,
          verdict: "not_triggered" as const,
          quality: null,
          evidence: [],
          comment: "本场对话中没有出现这一步骤的触发情形。",
          suggestion: null,
          rewrite: null,
        };
      }
      if (doneRefs.has(kp.ref)) {
        return {
          ref: kp.ref,
          verdict: "done" as const,
          quality: 4,
          evidence: [{ turn: 1, quote }],
          comment: "你在对话中做到了这一点，表达清楚。",
          suggestion: "可以再具体一些。",
          rewrite: null,
        };
      }
      return {
        ref: kp.ref,
        verdict: "missed" as const,
        quality: null,
        evidence: [],
        comment: "对话中没有体现这一要点。",
        suggestion: "下次在合适的时机补上这一点。",
        rewrite: {
          turn: 1,
          original: firstUserMessage(input.transcript),
          rewrite: `可以这样说：${kp.text}`,
          conceptRefs: [],
        },
      };
    }),
  );

  return {
    keyPointVerdicts,
    principleVerdicts: input.selected.principles.map((p) => ({
      ref: p.ref,
      verdict: "kept" as const,
      evidence: [],
      comment: "整场对话中没有违反这条原则。",
    })),
    holistic: { score: FAKE_HOLISTIC_SCORE, comment: "整体表达自然，仍有改进空间。" },
    outcome: { result: "unresolved", note: "对话结束时对方还没有明确态度。" },
    summary: { strengths: ["开场清楚"], improvements: ["补全遗漏的要点"] },
  };
}

export const debriefTask: TaskDef<DebriefInput, DebriefOutput> = {
  name: "debrief",
  promptVersion: "debrief@2",
  temperature: 0.2,
  schema: DebriefOutput,
  build,
  validate: validateDebrief,
  fake,
};
