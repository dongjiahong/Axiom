import { z } from "zod";

import {
  KeyPointVerdictValue,
  PrincipleVerdictValue,
  type DebriefSummary,
  type Difficulty,
  type Evidence,
  type MethodologySnapshot,
  type ModelRewrite,
  type Outcome,
  type PracticeMode,
  type Recognition,
  type ScoreBreakdown,
} from "@/domain/schemas";
import type { Debrief, Verdict } from "@/server/db/schema";

import type { SessionDto } from "./session";

/**
 * 复盘的客户端 DTO。只在会话已复盘（debriefed）后生成，因此可以包含目标方法论、
 * 场景隐藏字段等（data-model.md §4）。
 */

export const OverrideInput = z.object({
  verdict: z.union([KeyPointVerdictValue, PrincipleVerdictValue]),
  quality: z.number().int().nullable().default(null),
  reason: z.string().trim().min(1, "请填写改判理由"),
});
export type OverrideInput = z.infer<typeof OverrideInput>;

export interface VerdictDto {
  id: string;
  kind: "key_point" | "principle";
  /** 要点或原则的 ID（指向所选方法论快照内的节点）。 */
  refId: string;
  /** 要点或原则的文字。 */
  text: string;
  /** 证据核对后的判定与质量分（可能已降级）。 */
  verdict: KeyPointVerdictValue | PrincipleVerdictValue;
  quality: number | null;
  /** AI 原始判定。 */
  aiVerdict: KeyPointVerdictValue | PrincipleVerdictValue;
  aiQuality: number | null;
  evidenceDowngraded: boolean;
  comment: string;
  suggestion: string | null;
  evidence: Evidence[];
  rewrite: ModelRewrite | null;
  override: {
    verdict: KeyPointVerdictValue | PrincipleVerdictValue;
    quality: number | null;
    reason: string;
    overriddenAt: number;
  } | null;
  /** 生效判定 / 质量分（改判优先）。 */
  effectiveVerdict: KeyPointVerdictValue | PrincipleVerdictValue;
  effectiveQuality: number | null;
}

export interface DebriefDto {
  sessionId: string;
  mode: PracticeMode;
  difficulty: Difficulty;
  hintUsed: boolean;
  executionScore: number;
  scoreBreakdown: ScoreBreakdown;
  /** AI 整体印象分，仅展示，不计入统计。 */
  holisticScore: number;
  holisticComment: string;
  outcome: Outcome;
  outcomeNote: string;
  summary: DebriefSummary;
  /** 仅综合测验。 */
  recognition: {
    result: Recognition;
    explanation: string;
    selected: { id: string; name: string };
    target: { id: string; name: string };
    alternatives: { methodologyId: string; name: string; reason: string }[];
    designNotes: string;
  } | null;
  selected: { methodologyId: string; name: string; version: number };
  steps: {
    id: string;
    title: string;
    conditional: boolean;
    trigger: string | null;
    included: boolean;
    /** 该步骤得分（0–100），未计入时为 null。 */
    value: number | null;
    keyPoints: VerdictDto[];
  }[];
  principles: (VerdictDto & { principleKind: "do" | "dont" })[];
  concepts: { id: string; name: string; explanation: string }[];
  /** 已揭晓的会话（含完整对话、场景隐藏字段、目标方法论骨架）。 */
  session: SessionDto;
  createdAt: number;
  updatedAt: number;
}

export interface OverrideResultDto {
  verdict: VerdictDto;
  executionScore: number;
  scoreBreakdown: ScoreBreakdown;
}

export function toVerdictDto(row: Verdict, text: string): VerdictDto {
  const overridden = row.overrideVerdict !== null;
  return {
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    text,
    verdict: row.verdict,
    quality: row.quality,
    aiVerdict: row.aiVerdict,
    aiQuality: row.aiQuality,
    evidenceDowngraded: row.evidenceDowngraded,
    comment: row.comment,
    suggestion: row.suggestion,
    evidence: row.evidence,
    rewrite: row.rewrite,
    override:
      row.overrideVerdict !== null
        ? {
            verdict: row.overrideVerdict,
            quality: row.overrideQuality,
            reason: row.overrideReason ?? "",
            overriddenAt: row.overriddenAt ?? 0,
          }
        : null,
    effectiveVerdict: row.overrideVerdict ?? row.verdict,
    effectiveQuality: overridden ? row.overrideQuality : row.quality,
  };
}

export function toDebriefDto(params: {
  debrief: Debrief;
  verdicts: Verdict[];
  selected: MethodologySnapshot;
  target: MethodologySnapshot;
  session: SessionDto;
  mode: PracticeMode;
  difficulty: Difficulty;
  hintUsed: boolean;
}): DebriefDto {
  const { debrief, selected, session } = params;
  const byRef = new Map(params.verdicts.map((v) => [`${v.kind}:${v.refId}`, v]));
  const breakdownSteps = new Map(debrief.scoreBreakdown.steps.map((s) => [s.stepId, s]));

  return {
    sessionId: debrief.sessionId,
    mode: params.mode,
    difficulty: params.difficulty,
    hintUsed: params.hintUsed,
    executionScore: debrief.executionScore,
    scoreBreakdown: debrief.scoreBreakdown,
    holisticScore: debrief.holisticScore,
    holisticComment: debrief.holisticComment,
    outcome: debrief.outcome,
    outcomeNote: debrief.outcomeNote,
    summary: debrief.summary,
    recognition:
      params.mode === "quiz" && debrief.recognition
        ? {
            result: debrief.recognition,
            explanation: debrief.recognitionExplanation ?? "",
            selected: { id: selected.methodologyId, name: selected.name },
            target: { id: params.target.methodologyId, name: params.target.name },
            alternatives: session.alternatives ?? [],
            designNotes: session.designNotes ?? "",
          }
        : null,
    selected: { methodologyId: selected.methodologyId, name: selected.name, version: selected.version },
    steps: selected.body.steps.map((step) => {
      const info = breakdownSteps.get(step.id);
      return {
        id: step.id,
        title: step.title,
        conditional: step.conditional,
        trigger: step.trigger,
        included: info?.included ?? true,
        value: info?.value ?? null,
        keyPoints: step.keyPoints.flatMap((kp) => {
          const row = byRef.get(`key_point:${kp.id}`);
          return row ? [toVerdictDto(row, kp.text)] : [];
        }),
      };
    }),
    principles: selected.body.principles.flatMap((p) => {
      const row = byRef.get(`principle:${p.id}`);
      return row ? [{ ...toVerdictDto(row, p.text), principleKind: p.kind }] : [];
    }),
    concepts: selected.body.concepts.map((c) => ({ id: c.id, name: c.name, explanation: c.explanation })),
    session,
    createdAt: debrief.createdAt,
    updatedAt: debrief.updatedAt,
  };
}
