import { z } from "zod";

import { COUNTERPART_REPLY_MAX_CHARS, COUNTERPART_REPLY_PROMPT_CHARS } from "@/domain/constants";
import type { CounterpartBrief, Difficulty } from "@/domain/schemas";
import type { ChatMessage } from "@/server/llm/client";
import type { TaskDef } from "@/server/llm/run-task";

import { outputFormatPrompt } from "./common";

/**
 * 任务五：对方回复 `counterpart`（llm-and-prompts.md §9）。
 * 不向对方提供目标方法论，避免对方"配合考点"；只提供场景、角色卡与轮次信息。
 */

export interface CounterpartInput {
  scenario: {
    userRole: string;
    background: string;
    counterpart: { name: string; relation: string };
    brief: CounterpartBrief;
  };
  difficulty: Difficulty;
  /** 含对方开场白（turn 0）；最后一条一定是用户消息。 */
  history: { role: "user" | "counterpart"; content: string }[];
  /** 本轮轮次，即最后一条用户消息的 turn。 */
  turn: number;
  maxTurns: number;
}

export const CounterpartOutput = z.object({
  reply: z.string().min(1).max(COUNTERPART_REPLY_MAX_CHARS),
  firedResistanceIds: z.array(z.string()),
  end: z
    .object({ type: z.enum(["agreed", "broke_down", "closed"]), note: z.string() })
    .nullable(),
});
export type CounterpartOutput = z.infer<typeof CounterpartOutput>;

const SCHEMA_DESCRIPTION = `{
  "reply": string,                        // 你说的话，口语化，1–4 句
  "firedResistanceIds": string[],         // 本次回复触发了哪些计划阻力（如 ["r1"]），没有则为空数组
  "end": {                                // 对话是否就此结束；未结束为 null
    "type": "agreed" | "broke_down" | "closed",
    "note": string                        // 用一句话说明结果
  }?
}`;

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  cooperative: "配合。你友善开放，阻力温和；用户基本做到位，你就愿意让步。",
  neutral: "一般。你有自己的立场和顾虑；用户需要较完整地回应你的关切，你才会让步。",
  tough: "强硬。你强势、忙碌或情绪化，会反复施压、质疑或转移话题；只有用户高质量地应对，你才会做有限的让步。",
};

function systemPrompt(input: CounterpartInput): string {
  const { scenario, turn, maxTurns } = input;
  const { brief } = scenario;
  const name = scenario.counterpart.name;
  const resistances = brief.plannedResistance
    .map((r) => `${r.id}：当 ${r.trigger} 时，${r.reaction}`)
    .join("\n");
  const lastTurn = turn >= maxTurns ? "这是最后一轮，请在回复中自然地收尾。" : "";

  return `你正在一个沟通练习中扮演 ${name}（${scenario.counterpart.relation}）。与你对话的是用户扮演的"${scenario.userRole}"。

【场景】
${scenario.background}

【你的角色卡（绝不透露给对方）】
性格：${brief.personality}
真实立场：${brief.trueStance}
不会主动说出的顾虑：${brief.hiddenConcerns.join("；")}
计划阻力：
${resistances}
让步条件：${brief.yieldConditions}
谈崩条件：${brief.breakdownConditions}
难度：${DIFFICULTY_TEXT[input.difficulty]}

【表演规则】
1. 始终以 ${name} 的身份、口吻说话，口语化，每次 1–4 句，不超过 ${COUNTERPART_REPLY_PROMPT_CHARS} 字。可以用括号简短描写语气或动作，如"（皱了皱眉）"。
2. 只对用户**实际说出的话**做反应，不要替用户补全意思，不要主动帮用户解决问题。
3. 绝不跳出角色，不评价用户的沟通技巧，不提"练习""方法论""AI"。
4. 触发条件满足时，按计划阻力做出反应，并把该阻力的 id 写入 firedResistanceIds。同一条阻力可以因用户的回应不同而再次出现，但不要机械重复原话。
5. 只有满足让步条件时才让步；不要因为用户态度礼貌就轻易答应。
6. 当达成一致（agreed）、谈崩（broke_down）、或对话自然结束（closed）时，设置 end，并在 note 中用一句话说明结果；否则 end 为 null。

【当前轮次】
本轮是第 ${turn}/${maxTurns} 轮。${lastTurn}

${outputFormatPrompt(SCHEMA_DESCRIPTION)}
（历史对话中你的发言只显示了 reply 文本，但你本次必须输出完整 JSON。）`;
}

export function buildCounterpartMessages(input: CounterpartInput): ChatMessage[] {
  const history: ChatMessage[] = input.history.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));
  // 兼容要求首条非 system 消息必须是 user 的端点
  if (history[0]?.role === "assistant") {
    history.unshift({ role: "user", content: "（对话开始）" });
  }
  return [{ role: "system", content: systemPrompt(input) }, ...history];
}

export function validateCounterpart(output: CounterpartOutput, input: CounterpartInput): string[] {
  const known = new Set(input.scenario.brief.plannedResistance.map((r) => r.id));
  return output.firedResistanceIds
    .filter((id) => !known.has(id))
    .map((id) => `firedResistanceIds：「${id}」不是已有的计划阻力 id（可用：${[...known].join("、") || "无"}）`);
}

const FAKE_QUOTE_CHARS = 10;

function fake(input: CounterpartInput): CounterpartOutput {
  const lastUser = [...input.history].reverse().find((m) => m.role === "user")?.content ?? "";
  const firstResistance = input.scenario.brief.plannedResistance[0];
  return {
    reply: `（${input.scenario.counterpart.name}）我听到你说「${lastUser.slice(0, FAKE_QUOTE_CHARS)}」，再说说看？`,
    firedResistanceIds: input.turn === 1 && firstResistance ? [firstResistance.id] : [],
    end: lastUser.includes("谢谢") ? { type: "agreed", note: "对方接受了你的请求。" } : null,
  };
}

export const counterpartTask: TaskDef<CounterpartInput, CounterpartOutput> = {
  name: "counterpart",
  promptVersion: "counterpart@1",
  temperature: 0.8,
  schema: CounterpartOutput,
  build: buildCounterpartMessages,
  validate: validateCounterpart,
  fake,
};
