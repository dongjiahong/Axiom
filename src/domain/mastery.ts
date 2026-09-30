import { MASTERY_HALF_LIFE_DAYS, MASTERY_HINT_FACTOR, MASTERY_WINDOW } from "./constants";

/** 掌握度：纯函数，输入已复盘练习的记录与当前时间。 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 一场已复盘练习中与掌握度有关的字段。 */
export interface MasteryRecord {
  /** 执行归属：场景的目标方法论，也是用户所用的方法论。 */
  targetMethodologyId: string;
  hintUsed: boolean;
  /** 改判后重算的执行分（0–100）。 */
  executionScore: number;
  endedAt: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function latest(records: MasteryRecord[]): MasteryRecord[] {
  return [...records].sort((a, b) => b.endedAt - a.endedAt).slice(0, MASTERY_WINDOW);
}

/** 某个方法论的掌握度，0–1；从未练习过为 0。 */
export function computeMastery(
  methodologyId: string,
  records: MasteryRecord[],
  now: number,
): number {
  const sessions = latest(records.filter((r) => r.targetMethodologyId === methodologyId));
  if (sessions.length === 0) return 0;

  const base = mean(
    sessions.map((r) => (r.executionScore / 100) * (r.hintUsed ? MASTERY_HINT_FACTOR : 1)),
  );
  const lastEndedAt = Math.max(...sessions.map((r) => r.endedAt));
  const days = Math.max(0, (now - lastEndedAt) / MS_PER_DAY);
  const decay = 0.5 + 0.5 * 2 ** (-days / MASTERY_HALF_LIFE_DAYS);
  return base * decay;
}
