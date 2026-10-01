import type { Difficulty } from "@/domain/schemas";
import type { SessionStatus } from "@/server/db/schema";

/** 练习相关的界面文案（中文，与 CONTEXT.md 术语一致）。 */

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

/** 生成场景期间，全屏等待遮罩里轮播的阶段文案（大致按生成的先后顺序，不代表真实进度）。 */
export const SCENARIO_LOADING_MESSAGES = [
  "正在读一遍方法论骨架……",
  "正在搭建场景……",
  "设定对方性格……",
  "安排你和对方的身份关系……",
  "给对方一个不好松口的立场……",
  "埋下计划阻力……",
  "酝酿对方的开场情绪……",
  "编写开场白……",
  "检查有没有泄露步骤……",
  "最后通读一遍，看合不合理……",
];

/** 复盘期间遮罩里轮播的阶段文案（同样不代表真实进度）。 */
export const DEBRIEF_LOADING_MESSAGES = [
  "正在通读整段对话……",
  "逐条核对要点有没有做到……",
  "找出你原话里的证据……",
  "检查有没有违反原则……",
  "斟酌哪里还能说得更好……",
  "编写示范改写……",
  "汇总这一场的表现……",
];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  briefing: "准备中",
  active: "进行中",
  ended: "已结束",
  debriefed: "已复盘",
  debrief_failed: "复盘失败",
};
