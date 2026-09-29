import { z } from "zod";

/**
 * 领域模型。
 * 方法论正文存为一个带稳定 ID 的 JSON 文档。
 * 本文件只放纯类型与 Zod 模型，不依赖数据库、Next 或网络。
 */

/** 原文摘录的核对结果。 */
export const ExcerptMatch = z.enum(["exact", "fuzzy", "none"]);
export type ExcerptMatch = z.infer<typeof ExcerptMatch>;

/** 原文摘录：核对命中时 text 为资料中的真实片段，未命中时为 AI 原始摘录。 */
export const SourceExcerpt = z.object({
  text: z.string(),
  chunkId: z.string().nullable(),
  match: ExcerptMatch,
});
export type SourceExcerpt = z.infer<typeof SourceExcerpt>;

/** 所有方法论节点的公共字段；inferred=true（推断内容）时 excerpt 必须为 null。 */
const nodeBase = {
  id: z.string(),
  excerpt: SourceExcerpt.nullable(),
  inferred: z.boolean(),
};

/** 适用条件 / 反例的条目。 */
export const Item = z.object({ ...nodeBase, text: z.string().min(1) });
export type Item = z.infer<typeof Item>;

/** 要点：执行评判的最小单位。 */
export const KeyPoint = z.object({ ...nodeBase, text: z.string().min(1) });
export type KeyPoint = z.infer<typeof KeyPoint>;

/** 步骤；条件步骤（conditional=true）必须有 trigger。 */
export const Step = z.object({
  ...nodeBase,
  title: z.string().min(1),
  description: z.string(),
  conditional: z.boolean(),
  trigger: z.string().nullable(),
  keyPoints: z.array(KeyPoint).min(1),
  exampleLines: z.array(z.string()),
  commonMistakes: z.array(z.string()),
});
export type Step = z.infer<typeof Step>;

/** 原则：贯穿全程、无顺序的要求（do）或禁忌（dont）。 */
export const Principle = z.object({
  ...nodeBase,
  kind: z.enum(["do", "dont"]),
  text: z.string().min(1),
});
export type Principle = z.infer<typeof Principle>;

/** 概念：只用于反馈讲解，不单独评判。 */
export const Concept = z.object({
  ...nodeBase,
  name: z.string().min(1),
  explanation: z.string(),
  relatedStepIds: z.array(z.string()),
});
export type Concept = z.infer<typeof Concept>;

/** 方法论正文。 */
export const MethodologyBody = z.object({
  summary: z.string(),
  goal: z.string(),
  applicability: z.array(Item),
  counterIndications: z.array(Item),
  orderMode: z.enum(["strict", "loose"]),
  steps: z.array(Step).min(1),
  principles: z.array(Principle),
  concepts: z.array(Concept),
});
export type MethodologyBody = z.infer<typeof MethodologyBody>;

/** 方法论快照：练习开始时冻结的副本，之后修改方法论不影响历史练习。 */
export const MethodologySnapshot = z.object({
  methodologyId: z.string(),
  version: z.number().int(),
  name: z.string(),
  tags: z.array(z.string()),
  body: MethodologyBody,
});
export type MethodologySnapshot = z.infer<typeof MethodologySnapshot>;

/** 难度：配合 / 一般 / 强硬。 */
export const Difficulty = z.enum(["cooperative", "neutral", "tough"]);
export type Difficulty = z.infer<typeof Difficulty>;

/** 练习模式：专项练习 / 综合测验。 */
export const PracticeMode = z.enum(["drill", "quiz"]);
export type PracticeMode = z.infer<typeof PracticeMode>;

/** 选题方式：指定 / 随机。 */
export const SelectionMode = z.enum(["pick", "random"]);
export type SelectionMode = z.infer<typeof SelectionMode>;

/** 选题范围：三者取并集，全空表示整个方法论库。 */
export const Scope = z.object({
  tagIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  methodologyIds: z.array(z.string()),
});
export type Scope = z.infer<typeof Scope>;

/** 计划阻力：预先设计的对方反应。 */
export const PlannedResistance = z.object({
  id: z.string(),
  trigger: z.string(),
  reaction: z.string(),
  linkedStepId: z.string().nullable(),
});
export type PlannedResistance = z.infer<typeof PlannedResistance>;

/** 对方角色卡：对用户隐藏。 */
export const CounterpartBrief = z.object({
  personality: z.string(),
  trueStance: z.string(),
  hiddenConcerns: z.array(z.string()),
  plannedResistance: z.array(PlannedResistance),
  yieldConditions: z.string(),
  breakdownConditions: z.string(),
});
export type CounterpartBrief = z.infer<typeof CounterpartBrief>;

/** 备选方法论：同样适用于该场景但不是目标的方法论。 */
export const Alternative = z.object({ methodologyId: z.string(), reason: z.string() });
export type Alternative = z.infer<typeof Alternative>;

/** 证据：判定所引用的用户原话。 */
export const Evidence = z.object({
  turn: z.number().int().min(1),
  quote: z.string(),
  match: ExcerptMatch,
});
export type Evidence = z.infer<typeof Evidence>;

/** 要点判定：做到 / 部分做到 / 未做到 / 未触发。 */
export const KeyPointVerdictValue = z.enum(["done", "partial", "missed", "not_triggered"]);
export type KeyPointVerdictValue = z.infer<typeof KeyPointVerdictValue>;

/** 原则判定：遵守 / 违反。 */
export const PrincipleVerdictValue = z.enum(["kept", "violated"]);
export type PrincipleVerdictValue = z.infer<typeof PrincipleVerdictValue>;

/** 识别结果：正确 / 部分正确 / 错误。 */
export const Recognition = z.enum(["correct", "partial", "wrong"]);
export type Recognition = z.infer<typeof Recognition>;

/** 说服结果。 */
export const Outcome = z.enum(["agreed", "partial", "refused", "unresolved"]);
export type Outcome = z.infer<typeof Outcome>;

/** 示范改写。 */
export const ModelRewrite = z.object({
  turn: z.number().int().min(1),
  original: z.string(),
  rewrite: z.string(),
  conceptIds: z.array(z.string()),
});
export type ModelRewrite = z.infer<typeof ModelRewrite>;

/** 练习结束原因。 */
export const EndReason = z.enum(["user", "agreed", "broke_down", "closed", "turn_limit"]);
export type EndReason = z.infer<typeof EndReason>;

/** 对方消息中可以宣告的结束方式（不含用户结束与轮数上限）。 */
export const CounterpartEnd = z.object({
  type: z.enum(["agreed", "broke_down", "closed"]),
  note: z.string(),
});
export type CounterpartEnd = z.infer<typeof CounterpartEnd>;

/** 对方消息的 meta；不下发给 briefing / active / ended 状态的客户端。 */
export const MessageMeta = z.object({
  firedResistanceIds: z.array(z.string()),
  end: CounterpartEnd.nullable(),
});
export type MessageMeta = z.infer<typeof MessageMeta>;

/** 复盘的执行分明细。 */
export const ScoreBreakdown = z.object({
  base: z.number(),
  steps: z.array(
    z.object({
      stepId: z.string(),
      included: z.boolean(),
      value: z.number().nullable(),
    }),
  ),
  principlePenalty: z.number().int(),
  violatedPrincipleIds: z.array(z.string()),
  orderPenalty: z.number().int(),
  orderViolation: z
    .object({ earlierStepId: z.string(), laterStepId: z.string() })
    .nullable(),
  executionScore: z.number().int(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

/** 复盘总结。 */
export const DebriefSummary = z.object({
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});
export type DebriefSummary = z.infer<typeof DebriefSummary>;
