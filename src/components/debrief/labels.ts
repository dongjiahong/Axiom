import type { KeyPointVerdictValue, Outcome, PrincipleVerdictValue, Recognition } from "@/domain/schemas";

/** 复盘相关的界面文案（中文，与 CONTEXT.md 术语一致）。 */

export const VERDICT_LABELS: Record<KeyPointVerdictValue | PrincipleVerdictValue, string> = {
  done: "做到",
  partial: "部分做到",
  missed: "未做到",
  not_triggered: "未触发",
  kept: "遵守",
  violated: "违反",
};

export const VERDICT_STYLES: Record<KeyPointVerdictValue | PrincipleVerdictValue, string> = {
  done: "bg-emerald-100 text-emerald-800",
  kept: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  missed: "bg-red-100 text-red-800",
  violated: "bg-red-100 text-red-800",
  not_triggered: "bg-muted text-muted-foreground",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  agreed: "对方答应了",
  partial: "对方部分让步",
  refused: "对方拒绝了",
  unresolved: "尚无结论",
};

export const RECOGNITION_LABELS: Record<Recognition, string> = {
  correct: "正确",
  partial: "部分正确",
  wrong: "错误",
};

export const RECOGNITION_STYLES: Record<Recognition, string> = {
  correct: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  wrong: "bg-red-100 text-red-800",
};

export const stars = (quality: number | null): string =>
  quality === null ? "" : "★".repeat(quality) + "☆".repeat(5 - quality);
