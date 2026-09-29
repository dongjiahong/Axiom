import {
  ORDER_PENALTY,
  PRINCIPLE_PENALTY,
  PRINCIPLE_PENALTY_CAP,
  QUALITY_DEFAULT,
  QUALITY_MAX,
  QUALITY_RANGE,
} from "./constants";
import type {
  Evidence,
  KeyPointVerdictValue,
  MethodologyBody,
  PrincipleVerdictValue,
  ScoreBreakdown,
} from "./schemas";

/** 执行分（algorithms.md §5）。纯函数，无 IO。 */

// ───────────── 5.1 判定与质量分收敛 ─────────────

/**
 * AI 判定与质量分不一致时由代码收敛，不当作错误重试。
 * 非条件步骤下的 not_triggered 改为 missed（防御，校验阶段已要求重试）。
 */
export function convergeKeyPoint(
  verdict: KeyPointVerdictValue,
  quality: number | null,
  stepConditional: boolean,
): { verdict: KeyPointVerdictValue; quality: number | null } {
  if (verdict === "not_triggered" && !stepConditional) return { verdict: "missed", quality: null };
  if (verdict === "done") {
    const { min, max } = QUALITY_RANGE.done;
    if (quality === null || quality < min) return { verdict, quality: min };
    return { verdict, quality: Math.min(quality, max) };
  }
  if (verdict === "partial") {
    const { max } = QUALITY_RANGE.partial;
    if (quality === null) return { verdict, quality: QUALITY_DEFAULT.partial };
    return { verdict, quality: Math.min(quality, max) };
  }
  return { verdict, quality: null };
}

/** 改判入参校验（不合规返回中文错误；合规返回 null）。 */
export function validateKeyPointOverride(
  verdict: KeyPointVerdictValue,
  quality: number | null,
  stepConditional: boolean,
): string | null {
  if (verdict === "not_triggered" && !stepConditional) {
    return "只有条件步骤下的要点才能判为“未触发”";
  }
  if (verdict === "done" || verdict === "partial") {
    const { min, max } = QUALITY_RANGE[verdict];
    if (quality === null || !Number.isInteger(quality) || quality < min || quality > max) {
      return `判为“${verdict === "done" ? "做到" : "部分做到"}”时，质量分应为 ${min}–${max} 的整数`;
    }
    return null;
  }
  return quality === null ? null : "判为“未做到”或“未触发”时不应给质量分";
}

// ───────────── 5.2 计算 ─────────────

export interface EffectiveKeyPoint {
  verdict: KeyPointVerdictValue;
  quality: number | null;
  /** 该要点的证据（含 match，用于判断是否有效）。 */
  evidence: Evidence[];
}

export interface ScoringInput {
  body: MethodologyBody;
  /** keyPointId → 生效判定（改判优先）。缺失的要点按 missed 处理。 */
  keyPoints: Record<string, EffectiveKeyPoint | undefined>;
  /** principleId → 生效判定。 */
  principles: Record<string, PrincipleVerdictValue | undefined>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function computeExecutionScore(input: ScoringInput): ScoreBreakdown {
  const { body } = input;
  const missed: EffectiveKeyPoint = { verdict: "missed", quality: null, evidence: [] };

  const steps: ScoreBreakdown["steps"] = [];
  const stepValues: number[] = [];
  const orderSeq: { stepId: string; firstTurn: number }[] = [];

  for (const step of body.steps) {
    const kvs = step.keyPoints.map((kp) => input.keyPoints[kp.id] ?? missed);

    // 条件步骤未被触发：不计入分母，也不参与顺序检查
    if (step.conditional && kvs.every((v) => v.verdict === "not_triggered")) {
      steps.push({ stepId: step.id, included: false, value: null });
      continue;
    }

    // 被触发的条件步骤中残留的 not_triggered 按 missed 计
    const values = kvs.map((v) =>
      v.verdict === "done" || v.verdict === "partial" ? (v.quality ?? 0) / QUALITY_MAX : 0,
    );
    const value = mean(values);
    stepValues.push(value);
    steps.push({ stepId: step.id, included: true, value: round1(value * 100) });

    if (!step.conditional) {
      const turns = kvs
        .filter((v) => v.verdict === "done" || v.verdict === "partial")
        .flatMap((v) => v.evidence.filter((e) => e.match !== "none").map((e) => e.turn));
      // 没有有效证据（如被改判为做到）的步骤无法确定出现时机，不参与顺序检查
      if (turns.length > 0) orderSeq.push({ stepId: step.id, firstTurn: Math.min(...turns) });
    }
  }

  const base = stepValues.length === 0 ? 0 : mean(stepValues) * 100;

  const violatedPrincipleIds = body.principles
    .filter((p) => input.principles[p.id] === "violated")
    .map((p) => p.id);
  const principlePenalty = Math.min(violatedPrincipleIds.length * PRINCIPLE_PENALTY, PRINCIPLE_PENALTY_CAP);

  let orderPenalty = 0;
  let orderViolation: ScoreBreakdown["orderViolation"] = null;
  if (body.orderMode === "strict") {
    for (let i = 1; i < orderSeq.length; i++) {
      if (orderSeq[i].firstTurn < orderSeq[i - 1].firstTurn) {
        orderPenalty = ORDER_PENALTY;
        orderViolation = { earlierStepId: orderSeq[i - 1].stepId, laterStepId: orderSeq[i].stepId };
        break;
      }
    }
  }

  const executionScore = Math.min(100, Math.max(0, Math.round(base - principlePenalty - orderPenalty)));

  return {
    base: round1(base),
    steps,
    principlePenalty,
    violatedPrincipleIds,
    orderPenalty,
    orderViolation,
    executionScore,
  };
}
