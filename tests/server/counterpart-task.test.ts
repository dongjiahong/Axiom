import { describe, expect, it } from "vitest";

import { COUNTERPART_REPLY_MAX_CHARS } from "@/domain/constants";
import type { CounterpartBrief } from "@/domain/schemas";
import {
  buildCounterpartMessages,
  counterpartTask,
  validateCounterpart,
  type CounterpartInput,
} from "@/server/prompts/counterpart";

const brief: CounterpartBrief = {
  personality: "谨慎务实",
  trueStance: "不反对但要先看数据",
  hiddenConcerns: ["担心增加预算压力", "怕开先例"],
  plannedResistance: [
    { id: "r1", trigger: "用户直接提要求", reaction: "以预算为由拒绝", linkedStepId: null },
    { id: "r2", trigger: "用户没有给出依据", reaction: "追问依据", linkedStepId: null },
  ],
  yieldConditions: "给出具体成果与时间表",
  breakdownConditions: "用户威胁离职",
};

function makeInput(overrides: Partial<CounterpartInput> = {}): CounterpartInput {
  return {
    scenario: {
      userRole: "部门骨干",
      background: "你想和领导谈加薪。",
      counterpart: { name: "老王", relation: "直属领导" },
      brief,
    },
    difficulty: "neutral",
    history: [{ role: "user", content: "王总，方便聊聊吗？" }],
    turn: 1,
    maxTurns: 12,
    ...overrides,
  };
}

describe("counterpart 提示词组装", () => {
  it("只有一个 system 消息且在最前，含角色卡与阻力 id", () => {
    const messages = buildCounterpartMessages(makeInput());
    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("r1：当 用户直接提要求 时，以预算为由拒绝");
    expect(messages[0].content).toContain("老王");
    expect(messages[0].content).toContain("本轮是第 1/12 轮。");
    expect(messages[0].content).toContain("【输出格式】");
  });

  it("不含目标方法论相关内容（输入里本来就没有）", () => {
    const text = buildCounterpartMessages(makeInput())[0].content;
    expect(text).not.toContain("方法论：");
    expect(text).not.toContain("目标方法论");
  });

  it("只有最后一轮才追加收尾提示", () => {
    const normal = buildCounterpartMessages(makeInput({ turn: 11 }))[0].content;
    expect(normal).not.toContain("这是最后一轮");
    const last = buildCounterpartMessages(makeInput({ turn: 12 }))[0].content;
    expect(last).toContain("本轮是第 12/12 轮。这是最后一轮，请在回复中自然地收尾。");
  });

  it("有开场白时在其前补一条 user 消息；对方发言作为 assistant", () => {
    const messages = buildCounterpartMessages(
      makeInput({
        history: [
          { role: "counterpart", content: "你找我有事？" },
          { role: "user", content: "王总，想跟您聊聊。" },
        ],
      }),
    );
    expect(messages.slice(1).map((m) => [m.role, m.content])).toEqual([
      ["user", "（对话开始）"],
      ["assistant", "你找我有事？"],
      ["user", "王总，想跟您聊聊。"],
    ]);
  });

  it("用户先开口时不补消息", () => {
    const messages = buildCounterpartMessages(makeInput());
    expect(messages.slice(1).map((m) => m.role)).toEqual(["user"]);
  });
});

describe("counterpart 语义校验与 fake", () => {
  it("firedResistanceIds 必须是已有阻力 id", () => {
    const input = makeInput();
    expect(
      validateCounterpart({ reply: "嗯", firedResistanceIds: ["r1", "r2"], end: null }, input),
    ).toEqual([]);
    const errors = validateCounterpart({ reply: "嗯", firedResistanceIds: ["r9"], end: null }, input);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("r9");
  });

  it("schema 限制 reply 长度与 end 类型", () => {
    const ok = { reply: "嗯", firedResistanceIds: [], end: null };
    expect(counterpartTask.schema.safeParse(ok).success).toBe(true);
    expect(
      counterpartTask.schema.safeParse({ ...ok, reply: "长".repeat(COUNTERPART_REPLY_MAX_CHARS + 1) }).success,
    ).toBe(false);
    expect(counterpartTask.schema.safeParse({ ...ok, reply: "" }).success).toBe(false);
    expect(
      counterpartTask.schema.safeParse({ ...ok, end: { type: "user", note: "" } }).success,
    ).toBe(false);
  });

  it("fake 输出通过 schema 与 validate：第 1 轮触发 r1，含“谢谢”时结束", () => {
    const first = counterpartTask.fake(makeInput());
    expect(counterpartTask.schema.safeParse(first).success).toBe(true);
    expect(validateCounterpart(first, makeInput())).toEqual([]);
    expect(first.firedResistanceIds).toEqual(["r1"]);
    expect(first.reply).toContain("王总，方便聊聊吗");
    expect(first.end).toBeNull();

    const later = makeInput({
      turn: 2,
      history: [
        { role: "user", content: "王总，方便聊聊吗？" },
        { role: "counterpart", content: "说吧" },
        { role: "user", content: "谢谢您的理解" },
      ],
    });
    const out = counterpartTask.fake(later);
    expect(out.firedResistanceIds).toEqual([]);
    expect(out.end?.type).toBe("agreed");
    expect(validateCounterpart(out, later)).toEqual([]);
  });
});
