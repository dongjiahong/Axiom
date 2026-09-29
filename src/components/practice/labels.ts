import type { Difficulty, PracticeMode } from "@/domain/schemas";
import type { SessionStatus } from "@/server/db/schema";

/** 练习相关的界面文案（中文，与 CONTEXT.md 术语一致）。 */

export const MODE_LABELS: Record<PracticeMode, string> = {
  drill: "专项练习",
  quiz: "综合测验",
};

export const MODE_DESCRIPTIONS: Record<PracticeMode, string> = {
  drill: "目标方法论对你可见，只评判执行；对话中可以展开查看方法论骨架。",
  quiz: "目标方法论对你隐藏，开场前自己选择要用的方法论，同时评判识别与执行。",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  cooperative: "配合",
  neutral: "一般",
  tough: "强硬",
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  cooperative: "对方友善开放，阻力少而温和，按要点去做基本就能达成。",
  neutral: "对方有自己的立场和顾虑，需要较完整地执行要点才会让步。",
  tough: "对方强势或情绪化，会反复施压、质疑，只有高质量执行才可能换来部分让步。",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  briefing: "准备中",
  active: "进行中",
  ended: "已结束",
  debriefed: "已复盘",
  debrief_failed: "复盘失败",
};
