import { describe, expect, it } from "vitest";

import type { Evidence, KeyPointVerdictValue, MethodologyBody, Step } from "@/domain/schemas";
import {
  computeExecutionScore,
  convergeKeyPoint,
  validateKeyPointOverride,
  type EffectiveKeyPoint,
} from "@/domain/scoring";

import { makeKeyPoint, makeMethodologyBody, makeStep } from "../fixtures/methodology";

const ev = (turn: number, match: Evidence["match"] = "exact"): Evidence => ({ turn, quote: "原话", match });

function kv(
  verdict: KeyPointVerdictValue,
  quality: number | null,
  evidence: Evidence[] = verdict === "done" || verdict === "partial" ? [ev(1)] : [],
): EffectiveKeyPoint {
  return { verdict, quality, evidence };
}

function stepWith(n: number, overrides: Partial<Step> = {}): Step {
  return makeStep({ keyPoints: Array.from({ length: n }, () => makeKeyPoint()), ...overrides });
}

/** 给每个要点赋同一个判定。 */
function all(body: MethodologyBody, value: EffectiveKeyPoint): Record<string, EffectiveKeyPoint> {
  return Object.fromEntries(body.steps.flatMap((s) => s.keyPoints.map((k) => [k.id, value])));
}

describe("convergeKeyPoint（质量分收敛）", () => {
  it.each([
    ["done", null, 3],
    ["done", 1, 3],
    ["done", 2, 3],
    ["done", 3, 3],
    ["done", 4, 4],
    ["done", 5, 5],
    ["partial", null, 2],
    ["partial", 1, 1],
    ["partial", 3, 3],
    ["partial", 4, 3],
    ["partial", 5, 3],
  ] as const)("%s + 质量分 %s → %s", (verdict, quality, expected) => {
    expect(convergeKeyPoint(verdict, quality, false)).toEqual({ verdict, quality: expected });
  });

  it("missed / not_triggered 的质量分置空", () => {
    expect(convergeKeyPoint("missed", 4, false)).toEqual({ verdict: "missed", quality: null });
    expect(convergeKeyPoint("not_triggered", 2, true)).toEqual({ verdict: "not_triggered", quality: null });
  });

  it("非条件步骤下的 not_triggered 改为 missed", () => {
    expect(convergeKeyPoint("not_triggered", null, false)).toEqual({ verdict: "missed", quality: null });
  });
});

describe("validateKeyPointOverride（改判入参）", () => {
  it("质量分必须落在判定对应的范围", () => {
    expect(validateKeyPointOverride("done", 5, false)).toBeNull();
    expect(validateKeyPointOverride("done", 2, false)).not.toBeNull();
    expect(validateKeyPointOverride("done", null, false)).not.toBeNull();
    expect(validateKeyPointOverride("partial", 3, false)).toBeNull();
    expect(validateKeyPointOverride("partial", 4, false)).not.toBeNull();
    expect(validateKeyPointOverride("partial", 0, false)).not.toBeNull();
    expect(validateKeyPointOverride("done", 3.5, false)).not.toBeNull();
  });

  it("missed / not_triggered 不应有质量分", () => {
    expect(validateKeyPointOverride("missed", null, false)).toBeNull();
    expect(validateKeyPointOverride("missed", 3, false)).not.toBeNull();
    expect(validateKeyPointOverride("not_triggered", null, true)).toBeNull();
  });

  it("not_triggered 只能用于条件步骤", () => {
    expect(validateKeyPointOverride("not_triggered", null, false)).not.toBeNull();
  });
});

describe("computeExecutionScore", () => {
  it("全部 done 且质量分 5 → 100", () => {
    const body = makeMethodologyBody({ steps: [stepWith(2), stepWith(1)] });
    const result = computeExecutionScore({ body, keyPoints: all(body, kv("done", 5)), principles: {} });
    expect(result.executionScore).toBe(100);
    expect(result.base).toBe(100);
    expect(result.steps.every((s) => s.included && s.value === 100)).toBe(true);
  });

  it("质量分按 quality/5 折算，步骤内取均值、步骤间取均值", () => {
    const a = stepWith(2);
    const b = stepWith(1);
    const body = makeMethodologyBody({ steps: [a, b] });
    const result = computeExecutionScore({
      body,
      keyPoints: {
        [a.keyPoints[0].id]: kv("done", 5),
        [a.keyPoints[1].id]: kv("missed", null),
        [b.keyPoints[0].id]: kv("partial", 2),
      },
      principles: {},
    });
    // a = (1 + 0) / 2 = 0.5；b = 0.4；base = 45
    expect(result.steps.map((s) => s.value)).toEqual([50, 40]);
    expect(result.base).toBe(45);
    expect(result.executionScore).toBe(45);
  });

  it("全部 missed → 0", () => {
    const body = makeMethodologyBody({ steps: [stepWith(2)] });
    expect(
      computeExecutionScore({ body, keyPoints: all(body, kv("missed", null)), principles: {} }).executionScore,
    ).toBe(0);
  });

  it("条件步骤全部 not_triggered：排除出分母", () => {
    const normal = stepWith(1);
    const conditional = stepWith(2, { conditional: true, trigger: "对方拒绝" });
    const body = makeMethodologyBody({ steps: [normal, conditional] });
    const result = computeExecutionScore({
      body,
      keyPoints: {
        [normal.keyPoints[0].id]: kv("done", 5),
        ...Object.fromEntries(conditional.keyPoints.map((k) => [k.id, kv("not_triggered", null)])),
      },
      principles: {},
    });
    expect(result.executionScore).toBe(100);
    expect(result.steps[1]).toEqual({ stepId: conditional.id, included: false, value: null });
  });

  it("被触发的条件步骤中残留的 not_triggered 按 missed 计", () => {
    const conditional = stepWith(2, { conditional: true, trigger: "对方拒绝" });
    const body = makeMethodologyBody({ steps: [stepWith(1), conditional] });
    const [first] = body.steps;
    const result = computeExecutionScore({
      body,
      keyPoints: {
        [first.keyPoints[0].id]: kv("done", 5),
        [conditional.keyPoints[0].id]: kv("done", 5),
        [conditional.keyPoints[1].id]: kv("not_triggered", null),
      },
      principles: {},
    });
    // 条件步骤 = (1 + 0) / 2 = 0.5；base = (1 + 0.5) / 2 = 75
    expect(result.steps[1]).toEqual({ stepId: conditional.id, included: true, value: 50 });
    expect(result.executionScore).toBe(75);
  });

  it("所有步骤都被排除时 base = 0", () => {
    const conditional = stepWith(1, { conditional: true, trigger: "x" });
    const body = makeMethodologyBody({ steps: [conditional] });
    const result = computeExecutionScore({
      body,
      keyPoints: all(body, kv("not_triggered", null)),
      principles: {},
    });
    expect(result.base).toBe(0);
    expect(result.executionScore).toBe(0);
  });

  describe("原则扣分", () => {
    const principle = (text: string) => ({
      id: text,
      excerpt: null,
      inferred: true,
      kind: "dont" as const,
      text,
    });

    it.each([
      [0, 0],
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 30],
    ])("违反 %s 条 → 扣 %s（封顶 30）", (violations, penalty) => {
      const body = makeMethodologyBody({
        steps: [stepWith(1)],
        principles: ["a", "b", "c", "d", "e"].map(principle),
      });
      const principles = Object.fromEntries(
        body.principles.map((p, i) => [p.id, i < violations ? ("violated" as const) : ("kept" as const)]),
      );
      const result = computeExecutionScore({ body, keyPoints: all(body, kv("done", 5)), principles });
      expect(result.principlePenalty).toBe(penalty);
      expect(result.violatedPrincipleIds).toHaveLength(violations);
      expect(result.executionScore).toBe(100 - penalty);
    });
  });

  describe("顺序检查（strict）", () => {
    /** 三个非条件步骤，各自的首次出现轮次由参数指定。 */
    function build(turns: (number | null)[], orderMode: "strict" | "loose") {
      const steps = turns.map(() => stepWith(1));
      const body = makeMethodologyBody({ orderMode, steps });
      const keyPoints = Object.fromEntries(
        steps.map((s, i) => [
          s.keyPoints[0].id,
          turns[i] === null ? kv("missed", null) : kv("done", 5, [ev(turns[i]!)]),
        ]),
      );
      return { body, steps, result: computeExecutionScore({ body, keyPoints, principles: {} }) };
    }

    it("顺序正确不扣分（相同轮次不算逆序）", () => {
      expect(build([1, 2, 2], "strict").result.orderPenalty).toBe(0);
    });

    it("逆序扣 10 并报告第一对逆序步骤", () => {
      const { steps, result } = build([3, 1, 2], "strict");
      expect(result.orderPenalty).toBe(10);
      expect(result.orderViolation).toEqual({ earlierStepId: steps[0].id, laterStepId: steps[1].id });
      // 三步全部 done/5，base 100
      expect(result.executionScore).toBe(90);
    });

    it("只取每步有效证据中最小的轮次", () => {
      const a = stepWith(2);
      const b = stepWith(1);
      const body = makeMethodologyBody({ orderMode: "strict", steps: [a, b] });
      const result = computeExecutionScore({
        body,
        keyPoints: {
          [a.keyPoints[0].id]: kv("done", 5, [ev(5)]),
          [a.keyPoints[1].id]: kv("done", 5, [ev(1), ev(9, "none")]),
          [b.keyPoints[0].id]: kv("done", 5, [ev(2)]),
        },
        principles: {},
      });
      expect(result.orderPenalty).toBe(0);
    });

    it("未做到的步骤不参与顺序检查", () => {
      expect(build([3, null, 4], "strict").result.orderPenalty).toBe(0);
    });

    it("没有有效证据的步骤不参与顺序检查", () => {
      const { body, steps } = build([3, 1], "strict");
      const result = computeExecutionScore({
        body,
        keyPoints: {
          [steps[0].keyPoints[0].id]: kv("done", 5, [ev(3)]),
          [steps[1].keyPoints[0].id]: kv("done", 5, []),
        },
        principles: {},
      });
      expect(result.orderPenalty).toBe(0);
    });

    it("条件步骤不参与顺序检查", () => {
      const first = stepWith(1);
      const conditional = stepWith(1, { conditional: true, trigger: "对方拒绝" });
      const last = stepWith(1);
      const body = makeMethodologyBody({ orderMode: "strict", steps: [first, conditional, last] });
      const result = computeExecutionScore({
        body,
        keyPoints: {
          [first.keyPoints[0].id]: kv("done", 5, [ev(2)]),
          [conditional.keyPoints[0].id]: kv("done", 5, [ev(1)]),
          [last.keyPoints[0].id]: kv("done", 5, [ev(3)]),
        },
        principles: {},
      });
      expect(result.orderPenalty).toBe(0);
      expect(result.orderViolation).toBeNull();
    });

    it("loose 模式不检查顺序", () => {
      const { result } = build([3, 1, 2], "loose");
      expect(result.orderPenalty).toBe(0);
      expect(result.orderViolation).toBeNull();
      expect(result.executionScore).toBe(100);
    });
  });

  it("结果裁剪到 0–100", () => {
    const body = makeMethodologyBody({
      steps: [stepWith(1)],
      principles: ["a", "b", "c"].map((text) => ({
        id: text,
        excerpt: null,
        inferred: true,
        kind: "dont" as const,
        text,
      })),
    });
    const result = computeExecutionScore({
      body,
      keyPoints: all(body, kv("missed", null)),
      principles: { a: "violated", b: "violated", c: "violated" },
    });
    expect(result.base).toBe(0);
    expect(result.executionScore).toBe(0);
  });

  it("四舍五入取整", () => {
    const a = stepWith(1);
    const body = makeMethodologyBody({ steps: [a] });
    const result = computeExecutionScore({
      body,
      keyPoints: { [a.keyPoints[0].id]: kv("done", 3) },
      principles: {},
    });
    expect(result.executionScore).toBe(60);
    const b = stepWith(3);
    const body2 = makeMethodologyBody({ steps: [b] });
    const r2 = computeExecutionScore({
      body: body2,
      keyPoints: {
        [b.keyPoints[0].id]: kv("done", 5),
        [b.keyPoints[1].id]: kv("missed", null),
        [b.keyPoints[2].id]: kv("missed", null),
      },
      principles: {},
    });
    expect(r2.base).toBe(33.3);
    expect(r2.executionScore).toBe(33);
  });
});
