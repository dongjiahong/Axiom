import { describe, expect, it } from "vitest";

import { computeMastery, type MasteryRecord } from "@/domain/mastery";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29);

function record(overrides: Partial<MasteryRecord> = {}): MasteryRecord {
  return {
    targetMethodologyId: "m1",
    hintUsed: false,
    executionScore: 80,
    endedAt: NOW,
    ...overrides,
  };
}

describe("computeMastery", () => {
  it("从未练习为 0", () => {
    expect(computeMastery("m1", [], NOW)).toBe(0);
    expect(computeMastery("m1", [record({ targetMethodologyId: "m2" })], NOW)).toBe(0);
  });

  it("刚练过时等于执行分均值", () => {
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

  it("只按目标方法论归属", () => {
    const records = [record({ targetMethodologyId: "m2", executionScore: 100 })];
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(0);
    expect(computeMastery("m2", records, NOW)).toBeCloseTo(1);
  });

  it("时间衰减：30 天后 decay=0.75，越久越接近 0.5", () => {
    const at = (days: number) =>
      computeMastery("m1", [record({ executionScore: 100, endedAt: NOW - days * DAY })], NOW);
    expect(at(0)).toBeCloseTo(1);
    expect(at(30)).toBeCloseTo(0.75);
    expect(at(3000)).toBeCloseTo(0.5, 2);
  });

  it("衰减取最近一次练习的时间", () => {
    const records = [
      record({ executionScore: 0, endedAt: NOW - 30 * DAY }),
      record({ executionScore: 100, endedAt: NOW }),
    ];
    expect(computeMastery("m1", records, NOW)).toBeCloseTo(0.5);
  });
});
