import type { Difficulty, Outcome } from "@/domain/schemas";

/** 统计页的界面文案（中文，与 CONTEXT.md 术语一致）。 */

export const OUTCOME_ORDER: Outcome[] = ["agreed", "partial", "refused", "unresolved"];

export const OUTCOME_SHORT_LABELS: Record<Outcome, string> = {
  agreed: "答应",
  partial: "部分让步",
  refused: "拒绝",
  unresolved: "无结论",
};

export const DIFFICULTY_ORDER: Difficulty[] = ["cooperative", "neutral", "tough"];

export function formatScore(value: number | null): string {
  return value === null ? "—" : `${value}`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function formatMastery(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString("zh-CN", { hour12: false });
}
