import { describe, expect, it } from "vitest";

import { pickRandom, resolveScope } from "@/domain/selection";

const library = [
  { id: "a", sourceId: "s1", tagIds: ["work"] },
  { id: "b", sourceId: "s1", tagIds: ["love"] },
  { id: "c", sourceId: "s2", tagIds: ["work", "love"] },
  { id: "d", sourceId: null, tagIds: [] },
];

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("resolveScope", () => {
  it("全空 = 整个方法论库", () => {
    expect(ids(resolveScope({ tagIds: [], sourceIds: [] }, library))).toEqual(["a", "b", "c", "d"]);
  });

  it("标签需要全部命中，选得越多候选越少", () => {
    expect(ids(resolveScope({ tagIds: ["work"], sourceIds: [] }, library))).toEqual(["a", "c"]);
    expect(ids(resolveScope({ tagIds: ["work", "love"], sourceIds: [] }, library))).toEqual(["c"]);
  });

  it("资料任选其一，与标签取交集", () => {
    expect(ids(resolveScope({ tagIds: [], sourceIds: ["s2"] }, library))).toEqual(["c"]);
    expect(ids(resolveScope({ tagIds: ["work"], sourceIds: ["s2"] }, library))).toEqual(["c"]);
    expect(ids(resolveScope({ tagIds: ["love"], sourceIds: ["s2"] }, library))).toEqual(["c"]);
    expect(ids(resolveScope({ tagIds: ["love"], sourceIds: ["s1", "s2"] }, library))).toEqual(["b", "c"]);
  });

  it("范围没有命中任何方法论时为空", () => {
    expect(resolveScope({ tagIds: ["none"], sourceIds: [] }, library)).toEqual([]);
    expect(ids(resolveScope({ tagIds: ["work"], sourceIds: ["s1"] }, library))).toEqual(["a"]);
  });
});

describe("pickRandom", () => {
  const items = ["a", "b", "c"];

  it("按 rng 落在区间的均匀抽取", () => {
    expect(pickRandom(items, () => 0)).toBe("a");
    expect(pickRandom(items, () => 0.34)).toBe("b");
    expect(pickRandom(items, () => 0.99)).toBe("c");
    // rng 理论上是 [0, 1)，仍防御性收紧到最后一个
    expect(pickRandom(items, () => 1)).toBe("c");
  });

  it("均匀分布：每个候选被抽到的次数接近", () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = new Map(items.map((id) => [id, 0]));
    for (let i = 0; i < 3000; i++) {
      const id = pickRandom(items, rng);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeGreaterThan(850);
  });

  it("只有一个候选时必然选它；没有候选时报错", () => {
    expect(pickRandom(["x"], () => 0.5)).toBe("x");
    expect(() => pickRandom([], () => 0.5)).toThrow();
  });
});
