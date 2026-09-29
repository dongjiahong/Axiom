import { describe, expect, it } from "vitest";

import { SELECTION_EPSILON } from "@/domain/constants";
import { pickWeighted, resolveScope } from "@/domain/selection";

const library = [
  { id: "a", sourceId: "s1", tagIds: ["work"] },
  { id: "b", sourceId: "s1", tagIds: ["love"] },
  { id: "c", sourceId: "s2", tagIds: ["work", "love"] },
  { id: "d", sourceId: null, tagIds: [] },
];

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("resolveScope", () => {
  it("全空 = 整个方法论库", () => {
    expect(ids(resolveScope({ tagIds: [], sourceIds: [], methodologyIds: [] }, library))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("按标签、资料、方法论取并集，保持库中顺序", () => {
    const scope = { tagIds: ["love"], sourceIds: ["s1"], methodologyIds: ["d"] };
    expect(ids(resolveScope(scope, library))).toEqual(["a", "b", "c", "d"]);
    expect(ids(resolveScope({ tagIds: ["work"], sourceIds: [], methodologyIds: [] }, library))).toEqual([
      "a",
      "c",
    ]);
    expect(ids(resolveScope({ tagIds: [], sourceIds: ["s2"], methodologyIds: ["d"] }, library))).toEqual([
      "c",
      "d",
    ]);
  });

  it("范围没有命中任何方法论时为空", () => {
    expect(resolveScope({ tagIds: ["none"], sourceIds: [], methodologyIds: [] }, library)).toEqual([]);
  });
});

describe("pickWeighted", () => {
  const items = [
    { id: "low", mastery: 0 },
    { id: "high", mastery: 1 },
  ];
  // 权重：low = 1 + ε，high = ε
  const total = 1 + 2 * SELECTION_EPSILON;

  it("固定 rng 下按权重区间抽取", () => {
    expect(pickWeighted(items, () => 0)).toBe("low");
    expect(pickWeighted(items, () => (1 + SELECTION_EPSILON) / total - 1e-9)).toBe("low");
    expect(pickWeighted(items, () => (1 + SELECTION_EPSILON) / total + 1e-9)).toBe("high");
    expect(pickWeighted(items, () => 0.999999)).toBe("high");
  });

  it("掌握度高的也有机会被抽到，且统计上偏向掌握度低的", () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = { low: 0, high: 0 };
    for (let i = 0; i < 2000; i++) counts[pickWeighted(items, rng) as "low" | "high"]++;
    expect(counts.high).toBeGreaterThan(0);
    expect(counts.low).toBeGreaterThan(counts.high * 4);
  });

  it("只有一个候选时必然选它；没有候选时报错", () => {
    expect(pickWeighted([{ id: "x", mastery: 0.9 }], () => 0.5)).toBe("x");
    expect(() => pickWeighted([], () => 0.5)).toThrow();
  });
});
