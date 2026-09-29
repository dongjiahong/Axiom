import { describe, expect, it } from "vitest";

import { computeMastery, type MasteryRecord } from "@/domain/mastery";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29);

function record(overrides: Partial<MasteryRecord> = {}): MasteryRecord {
  return {
    selectedMethodologyId: "m1",
    targetMethodologyId: "m1",
    mode: "drill",
    hintUsed: false,
    executionScore: 80,
    recognition: null,
    endedAt: NOW,
    ...overrides,
  };
}

describe("computeMastery", () => {
  it("从未练习为 0", () => {
    expect(computeMastery("m1", [], NOW)).toBe(0);
    expect(computeMastery("m1", [record({ selectedMethodologyId: "m2", targetMethodologyId: "m2" })], NOW)).toBe(0);
  });

  it("只有执行时等于执行分均值（刚练过 decay=1）", () => {
    const records = [record({ executionScore: 80 }), record({ executionScore: 60 })];
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(0.7);
  });

  it("查看过提示的练习按系数折算", () => {
    expect(computeMastery("m1", [record({ executionScore: 100, hintUsed: true })], NOW)).toBeCloseTo(0.7);
  });

  it("只取最近 5 场", () => {
    const old = Array.from({ length: 3 }, (_, i) =>
      record({ executionScore: 0, endedAt: NOW - (10 + i) * 1000 }),
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      record({ executionScore: 100, endedAt: NOW - i * 1000 }),
    );
    expect(computeMastery("m1", [...old, ...recent], NOW)).toBeCloseTo(1);
  });

  it("执行与识别按 0.6/0.4 加权；识别归属于目标方法论", () => {
    const records = [
      record({ executionScore: 100 }),
      // 用户在综合测验中误选了 m1，但目标是 m2：执行归 m1，识别归 m2
      record({
        selectedMethodologyId: "m1",
        targetMethodologyId: "m2",
        mode: "quiz",
        executionScore: 100,
        recognition: "wrong",
      }),
      record({
        selectedMethodologyId: "m2",
        targetMethodologyId: "m1",
        mode: "quiz",
        executionScore: 0,
        recognition: "partial",
      }),
    ];
    // m1：E = 1，R = mean([partial]) = 0.5
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(0.6 * 1 + 0.4 * 0.5);
    // m2：E = 0，R = mean([wrong]) = 0
    expect(computeMastery("m2", records, NOW)).toBeCloseTo(0);
  });

  it("只有识别记录时执行部分按 0 计", () => {
    const records = [
      record({
        selectedMethodologyId: "m2",
        targetMethodologyId: "m1",
        mode: "quiz",
        recognition: "correct",
      }),
    ];
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(0.4);
  });

  it("时间衰减：30 天后 decay=0.75，越久越接近 0.5", () => {
    const at = (days: number) =>
      computeMastery("m1", [record({ executionScore: 100, endedAt: NOW - days * DAY })], NOW);
    expect(at(0)).toBeCloseTo(1);
    expect(at(30)).toBeCloseTo(0.75);
    expect(at(3000)).toBeCloseTo(0.5, 2);
  });

  it("衰减取两类练习中最近的一次", () => {
    const records = [
      record({ executionScore: 100, endedAt: NOW - 30 * DAY }),
      record({
        selectedMethodologyId: "m2",
        targetMethodologyId: "m1",
        mode: "quiz",
        recognition: "correct",
        endedAt: NOW,
      }),
    ];
    // base = 0.6*1 + 0.4*1 = 1，decay 按 NOW 计算 = 1
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(1);
  });
});
