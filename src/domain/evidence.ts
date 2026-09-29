import { findText } from "./text-match";
import type { Evidence, KeyPointVerdictValue, PrincipleVerdictValue } from "./schemas";

/** 证据核对与降级（algorithms.md §4）。纯函数，无 IO。 */

export interface UserMessageText {
  turn: number;
  content: string;
}

export interface RawEvidence {
  turn: number;
  quote: string;
}

/**
 * 逐条核对 AI 给出的证据：先在其声称的轮次里找，找不到再到其他用户消息里找（并修正 turn）；
 * 命中时 quote 替换为用户的真实原话片段。
 */
export function checkEvidence(evidence: RawEvidence[], userMessages: UserMessageText[]): Evidence[] {
  const haystacks = userMessages.map((m) => ({ id: String(m.turn), text: m.content }));
  return evidence.map((item) => {
    const own = haystacks.filter((h) => h.id === String(item.turn));
    const others = haystacks.filter((h) => h.id !== String(item.turn));
    for (const scope of [own, others]) {
      if (scope.length === 0) continue;
      const found = findText(item.quote, scope);
      if (found) return { turn: Number(found.haystackId), quote: found.text, match: found.match };
    }
    return { turn: item.turn, quote: item.quote, match: "none" as const };
  });
}

export const hasValidEvidence = (evidence: Evidence[]): boolean =>
  evidence.some((e) => e.match !== "none");

export interface DowngradeResult<V> {
  verdict: V;
  quality: number | null;
  downgraded: boolean;
}

/** 要点判定：done / partial 引不出有效证据则按 missed 处理。 */
export function downgradeKeyPoint(
  verdict: KeyPointVerdictValue,
  quality: number | null,
  evidence: Evidence[],
): DowngradeResult<KeyPointVerdictValue> {
  if ((verdict === "done" || verdict === "partial") && !hasValidEvidence(evidence)) {
    return { verdict: "missed", quality: null, downgraded: true };
  }
  return { verdict, quality, downgraded: false };
}

/** 原则判定：violated 引不出有效证据则按 kept 处理。 */
export function downgradePrinciple(
  verdict: PrincipleVerdictValue,
  evidence: Evidence[],
): DowngradeResult<PrincipleVerdictValue> {
  if (verdict === "violated" && !hasValidEvidence(evidence)) {
    return { verdict: "kept", quality: null, downgraded: true };
  }
  return { verdict, quality: null, downgraded: false };
}
