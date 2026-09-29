import { describe, expect, it } from "vitest";

import {
  checkEvidence,
  downgradeKeyPoint,
  downgradePrinciple,
  hasValidEvidence,
} from "@/domain/evidence";
import type { Evidence } from "@/domain/schemas";
import { computeRecognition } from "@/domain/recognition";

const messages = [
  { turn: 1, content: "领导您好，我想和您聊聊我今年的工作成果，可以占用您十分钟吗？" },
  { turn: 2, content: "去年我把客户流失率从 12% 降到了 8%，这是有数据支持的。" },
  { turn: 3, content: "我理解预算紧张，那么请问需要满足什么条件才能考虑加薪呢？" },
];

describe("checkEvidence", () => {
  it("精确命中：quote 替换为用户真实原话（含标点差异）", () => {
    const [result] = checkEvidence([{ turn: 1, quote: "我想和您聊聊我今年的工作成果" }], messages);
    expect(result).toEqual({ turn: 1, quote: "我想和您聊聊我今年的工作成果", match: "exact" });
    const [loose] = checkEvidence([{ turn: 1, quote: "我想和您聊聊，我今年的 工作成果" }], messages);
    expect(loose.match).toBe("exact");
    expect(loose.quote).toBe("我想和您聊聊我今年的工作成果");
  });

  it("模糊命中", () => {
    const [result] = checkEvidence(
      [{ turn: 2, quote: "去年我把客户流失率从12%降到了8%，这是有数据依据的" }],
      messages,
    );
    expect(result.match).toBe("fuzzy");
    expect(result.turn).toBe(2);
  });

  it("turn 错但能在其他轮找到时修正 turn", () => {
    const [result] = checkEvidence([{ turn: 1, quote: "需要满足什么条件才能考虑加薪" }], messages);
    expect(result).toEqual({ turn: 3, quote: "需要满足什么条件才能考虑加薪", match: "exact" });
  });

  it("找不到时 match=none，保留 AI 原文与轮次", () => {
    const [result] = checkEvidence([{ turn: 2, quote: "我要求立刻涨薪百分之五十" }], messages);
    expect(result).toEqual({ turn: 2, quote: "我要求立刻涨薪百分之五十", match: "none" });
  });

  it("引用过短时不核对", () => {
    expect(checkEvidence([{ turn: 1, quote: "我" }], messages)[0].match).toBe("none");
  });

  it("轮次不存在时仍会到其他轮里找", () => {
    const [result] = checkEvidence([{ turn: 9, quote: "可以占用您十分钟吗" }], messages);
    expect(result.turn).toBe(1);
    expect(result.match).toBe("exact");
  });
});

describe("证据降级", () => {
  const good: Evidence = { turn: 1, quote: "原话", match: "exact" };
  const fuzzy: Evidence = { turn: 1, quote: "原话", match: "fuzzy" };
  const bad: Evidence = { turn: 1, quote: "原话", match: "none" };

  it("hasValidEvidence", () => {
    expect(hasValidEvidence([])).toBe(false);
    expect(hasValidEvidence([bad])).toBe(false);
    expect(hasValidEvidence([bad, fuzzy])).toBe(true);
  });

  it("done / partial 没有有效证据 → missed，质量分置空", () => {
    expect(downgradeKeyPoint("done", 4, [bad])).toEqual({ verdict: "missed", quality: null, downgraded: true });
    expect(downgradeKeyPoint("partial", 2, [])).toEqual({ verdict: "missed", quality: null, downgraded: true });
  });

  it("有一条有效证据即保留", () => {
    expect(downgradeKeyPoint("done", 4, [bad, good])).toEqual({ verdict: "done", quality: 4, downgraded: false });
    expect(downgradeKeyPoint("partial", 2, [fuzzy])).toEqual({ verdict: "partial", quality: 2, downgraded: false });
  });

  it("missed / not_triggered 不变", () => {
    expect(downgradeKeyPoint("missed", null, [])).toEqual({ verdict: "missed", quality: null, downgraded: false });
    expect(downgradeKeyPoint("not_triggered", null, [])).toEqual({
      verdict: "not_triggered",
      quality: null,
      downgraded: false,
    });
  });

  it("violated 没有有效证据 → kept", () => {
    expect(downgradePrinciple("violated", [bad]).verdict).toBe("kept");
    expect(downgradePrinciple("violated", [bad]).downgraded).toBe(true);
    expect(downgradePrinciple("violated", [good]).verdict).toBe("violated");
    expect(downgradePrinciple("kept", []).downgraded).toBe(false);
  });
});

describe("computeRecognition", () => {
  it("选中目标 → correct（1）", () => {
    expect(computeRecognition({ selectedId: "t", targetId: "t", alternativeIds: ["a"] })).toEqual({
      recognition: "correct",
      score: 1,
    });
  });

  it("选中备选 → partial（0.5）", () => {
    expect(computeRecognition({ selectedId: "a", targetId: "t", alternativeIds: ["a", "b"] })).toEqual({
      recognition: "partial",
      score: 0.5,
    });
  });

  it("其他 → wrong（0）", () => {
    expect(computeRecognition({ selectedId: "x", targetId: "t", alternativeIds: ["a"] })).toEqual({
      recognition: "wrong",
      score: 0,
    });
  });
});
