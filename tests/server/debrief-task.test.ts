import { describe, expect, it } from "vitest";

import type { MethodologySnapshot } from "@/domain/schemas";
import {
  buildDebriefRefs,
  buildSelectedInput,
  buildTranscript,
  debriefTask,
  DebriefOutput,
  validateDebrief,
  type DebriefInput,
} from "@/server/prompts/debrief";

import { makeKeyPoint, makeMethodologyBody, makeStep } from "../fixtures/methodology";

function snapshot(): MethodologySnapshot {
  return {
    methodologyId: "m-1",
    version: 1,
    name: "向领导提加薪",
    tags: ["职场"],
    body: makeMethodologyBody({
      orderMode: "strict",
      steps: [
        makeStep({ title: "预约合适的时机", keyPoints: [makeKeyPoint("提前预约"), makeKeyPoint("说明谈话主题")] }),
        makeStep({ title: "用数据陈述贡献", keyPoints: [makeKeyPoint("列出具体成果")] }),
        makeStep({
          title: "对方拒绝时追问条件",
          conditional: true,
          trigger: "对方以预算为由拒绝",
          keyPoints: [makeKeyPoint("询问条件与时间表")],
        }),
      ],
      principles: [
        { id: "pr-1", excerpt: null, inferred: true, kind: "dont", text: "不威胁离职" },
        { id: "pr-2", excerpt: null, inferred: true, kind: "do", text: "保持尊重" },
      ],
      concepts: [
        { id: "cn-1", excerpt: null, inferred: true, name: "锚定效应", explanation: "先提的数字影响后续判断", relatedStepIds: [] },
      ],
    }),
  };
}

function input(): DebriefInput {
  const messages = [
    { role: "counterpart" as const, turn: 0, content: "你找我有事吗？" },
    { role: "user" as const, turn: 1, content: "领导您好，我想和您约个时间聊聊我今年的工作成果。" },
    { role: "counterpart" as const, turn: 1, content: "最近预算很紧。" },
    { role: "user" as const, turn: 2, content: "我理解，那需要满足什么条件才能考虑加薪呢？" },
  ];
  return {
    scenario: {
      title: "示例",
      background: "背景",
      userRole: "员工",
      userGoal: "加薪",
      counterpart: { name: "老王", relation: "领导", profile: "严肃" },
      openingLine: "你找我有事吗？",
      brief: {
        personality: "谨慎",
        trueStance: "可以考虑",
        hiddenConcerns: ["预算"],
        plannedResistance: [{ id: "r1", trigger: "提出加薪", reaction: "预算紧张" }],
        yieldConditions: "有数据",
        breakdownConditions: "威胁",
      },
      designNotes: "说明",
    },
    selected: buildSelectedInput(snapshot()),
    transcript: buildTranscript(messages),
    firedResistance: [{ id: "r1", trigger: "提出加薪", linkedStepTitle: "对方拒绝时追问条件", turns: [1] }],
    userTurnCount: 2,
  };
}

/** 一份对 input() 完全合规的输出：从 fake 起步。 */
function valid() {
  return structuredClone(debriefTask.fake(input()));
}

describe("引用与转录", () => {
  it("要点引用 k1.. 在整个方法论内连续编号", () => {
    const refs = buildDebriefRefs(snapshot().body);
    expect([...refs.keyPoints.keys()]).toEqual(["k1", "k2", "k3", "k4"]);
    expect([...refs.principles.keys()]).toEqual(["p1", "p2"]);
    expect([...refs.concepts.keys()]).toEqual(["c1"]);
    const selected = buildSelectedInput(snapshot());
    expect(selected.steps.map((s) => s.keyPoints.map((k) => k.ref))).toEqual([["k1", "k2"], ["k3"], ["k4"]]);
  });

  it("transcript 使用“第N轮·你/对方”格式", () => {
    expect(input().transcript.split("\n")).toEqual([
      "[第0轮·对方] 你找我有事吗？",
      "[第1轮·你] 领导您好，我想和您约个时间聊聊我今年的工作成果。",
      "[第1轮·对方] 最近预算很紧。",
      "[第2轮·你] 我理解，那需要满足什么条件才能考虑加薪呢？",
    ]);
  });

  it("提示词包含全部引用与对话", () => {
    const messages = debriefTask.build(input());
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("「向领导提加薪」");
    const user = messages[1].content;
    for (const ref of ["k1", "k4", "p2", "c1"]) expect(user).toContain(`"ref": "${ref}"`);
    expect(user).toContain("[第2轮·你]");
  });
});

describe("fake", () => {
  it("输出通过 schema 与语义校验", () => {
    const out = debriefTask.fake(input());
    expect(DebriefOutput.safeParse(out).success).toBe(true);
    expect(validateDebrief(out, input())).toEqual([]);
  });

  it("非条件要点前一半 done、后一半 missed；条件要点 not_triggered；原则 kept", () => {
    const out = debriefTask.fake(input());
    expect(out.keyPointVerdicts.map((v) => [v.ref, v.verdict])).toEqual([
      ["k1", "done"],
      ["k2", "done"],
      ["k3", "missed"],
      ["k4", "not_triggered"],
    ]);
    expect(out.keyPointVerdicts[0].evidence[0]).toEqual({ turn: 1, quote: "领导您好，我想和您约" });
    expect(out.keyPointVerdicts[2].rewrite).not.toBeNull();
    expect(out.principleVerdicts.every((p) => p.verdict === "kept")).toBe(true);
    expect(out.holistic.score).toBe(70);
    expect(out.outcome.result).toBe("unresolved");
  });
});

describe("validateDebrief 语义校验", () => {
  it("合规输出无错误", () => {
    expect(validateDebrief(valid(), input())).toEqual([]);
  });

  it("缺少要点、缺少原则", () => {
    const out = valid();
    out.keyPointVerdicts.pop();
    out.principleVerdicts.pop();
    const errors = validateDebrief(out, input());
    expect(errors.some((e) => e.includes("缺少要点「k4」"))).toBe(true);
    expect(errors.some((e) => e.includes("缺少原则「p2」"))).toBe(true);
  });

  it("重复与未知引用", () => {
    const out = valid();
    out.keyPointVerdicts[1].ref = "k1";
    out.keyPointVerdicts[2].ref = "k99";
    out.principleVerdicts[1].ref = "p1";
    const errors = validateDebrief(out, input());
    expect(errors.some((e) => e.includes("「k1」重复出现"))).toBe(true);
    expect(errors.some((e) => e.includes("「k99」不是已知的要点引用"))).toBe(true);
    expect(errors.some((e) => e.includes("「p1」重复出现"))).toBe(true);
  });

  it("not_triggered 只能用于条件步骤下的要点", () => {
    const out = valid();
    out.keyPointVerdicts[0] = { ...out.keyPointVerdicts[0], verdict: "not_triggered", quality: null, evidence: [] };
    expect(validateDebrief(out, input()).some((e) => e.includes("不在条件步骤下"))).toBe(true);
  });

  it("done / partial / violated 必须有证据", () => {
    const out = valid();
    out.keyPointVerdicts[0].evidence = [];
    out.principleVerdicts[0] = { ref: "p1", verdict: "violated", evidence: [], comment: "违反" };
    const errors = validateDebrief(out, input());
    expect(errors.some((e) => e.startsWith("keyPointVerdicts[0].evidence"))).toBe(true);
    expect(errors.some((e) => e.startsWith("principleVerdicts[0].evidence"))).toBe(true);
  });

  it("evidence 与 rewrite 的 turn 必须在 1..userTurnCount 内", () => {
    const out = valid();
    out.keyPointVerdicts[0].evidence = [{ turn: 3, quote: "领导您好" }];
    out.keyPointVerdicts[2].rewrite!.turn = 0;
    const errors = validateDebrief(out, input());
    expect(errors.some((e) => e.includes("keyPointVerdicts[0].evidence[0].turn"))).toBe(true);
    expect(errors.some((e) => e.includes("keyPointVerdicts[2].rewrite.turn"))).toBe(true);
  });

  it("partial / missed 必须有 rewrite，conceptRefs 必须已知", () => {
    const out = valid();
    out.keyPointVerdicts[2].rewrite = null;
    out.keyPointVerdicts[1] = {
      ...out.keyPointVerdicts[1],
      verdict: "partial",
      quality: 2,
      rewrite: { turn: 1, original: "原话", rewrite: "改写", conceptRefs: ["c9"] },
    };
    const errors = validateDebrief(out, input());
    expect(errors.some((e) => e.includes("keyPointVerdicts[2].rewrite：判为 missed"))).toBe(true);
    expect(errors.some((e) => e.includes("「c9」不是已知的概念引用"))).toBe(true);
  });

  it("质量分与判定不一致不算错误（由代码收敛）", () => {
    const out = valid();
    out.keyPointVerdicts[0].quality = 1;
    expect(validateDebrief(out, input())).toEqual([]);
  });
});
