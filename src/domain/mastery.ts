import {
  MASTERY_HALF_LIFE_DAYS,
  MASTERY_HINT_FACTOR,
  MASTERY_W_EXEC,
  MASTERY_W_RECOG,
  MASTERY_WINDOW,
  RECOGNITION_SCORE,
} from "./constants";
import type { PracticeMode, Recognition } from "./schemas";

/** 掌握度：纯函数，输入已复盘练习的记录与当前时间。 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 一场已复盘练习中与掌握度有关的字段。 */
export interface MasteryRecord {
  /** 执行归属：用户所用的方法论。 */
  selectedMethodologyId: string | null;
  /** 识别归属：场景的目标方法论。 */
  targetMethodologyId: string;
  mode: PracticeMode;
  hintUsed: boolean;
  /** 改判后重算的执行分（0–100）。 */
  executionScore: number;
  /** 仅综合测验有值。 */
  recognition: Recognition | null;
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
  const execSessions = latest(records.filter((r) => r.selectedMethodologyId === methodologyId));
  const recogSessions = latest(
    records.filter(
      (r) => r.targetMethodologyId === methodologyId && r.mode === "quiz" && r.recognition !== null,
    ),
  );
  if (execSessions.length === 0 && recogSessions.length === 0) return 0;

  const execValue =
    execSessions.length === 0
      ? 0
      : mean(
          execSessions.map(
            (r) => (r.executionScore / 100) * (r.hintUsed ? MASTERY_HINT_FACTOR : 1),
          ),
        );
  const base =
    recogSessions.length === 0
      ? execValue
      : MASTERY_W_EXEC * execValue +
        MASTERY_W_RECOG *
          mean(recogSessions.map((r) => RECOGNITION_SCORE[r.recognition as Recognition]));

  const lastEndedAt = Math.max(...[...execSessions, ...recogSessions].map((r) => r.endedAt));
  const days = Math.max(0, (now - lastEndedAt) / MS_PER_DAY);
  const decay = 0.5 + 0.5 * 2 ** (-days / MASTERY_HALF_LIFE_DAYS);
  return base * decay;
}
