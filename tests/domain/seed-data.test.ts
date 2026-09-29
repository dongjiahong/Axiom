import { describe, expect, it } from "vitest";

import { SEED_METHODOLOGIES } from "../../scripts/seed-data";
import { validateMethodologyForConfirm } from "@/domain/methodology-validate";
import { MethodologyBody } from "@/domain/schemas";

/** 种子数据必须通过 MethodologyBody 校验与确认校验。 */
describe("种子方法论", () => {
  it("共 5 个：4 个已确认 + 1 个候选", () => {
    expect(SEED_METHODOLOGIES).toHaveLength(5);
    expect(SEED_METHODOLOGIES.filter((seed) => seed.status === "confirmed")).toHaveLength(4);
    expect(SEED_METHODOLOGIES.filter((seed) => seed.status === "draft")).toHaveLength(1);
  });

  it("每个都通过 MethodologyBody 校验", () => {
    for (const seed of SEED_METHODOLOGIES) {
      const result = MethodologyBody.safeParse(seed.body);
      expect(result.error?.message ?? "", seed.name).toBe("");
      expect(result.success).toBe(true);
    }
  });

  it("每个都通过确认前校验", () => {
    for (const seed of SEED_METHODOLOGIES) {
      expect(validateMethodologyForConfirm({ name: seed.name, body: seed.body }), seed.name).toEqual(
        [],
      );
    }
  });

  it("每个都有标签", () => {
    for (const seed of SEED_METHODOLOGIES) {
      expect(seed.tags.length).toBeGreaterThan(0);
    }
  });

  it("包含题目要求的 4 个已确认方法论", () => {
    const names = SEED_METHODOLOGIES.filter((seed) => seed.status === "confirmed").map(
      (seed) => seed.name,
    );
    expect(names).toEqual([
      "向领导提加薪",
      "结论先行的工作汇报",
      "先共情再建议的安慰法",
      "拒绝额外工作请求",
    ]);
  });

  it("至少 2 个含条件步骤，且条件步骤都有 trigger", () => {
    const withConditional = SEED_METHODOLOGIES.filter((seed) =>
      seed.body.steps.some((step) => step.conditional),
    );
    expect(withConditional.length).toBeGreaterThanOrEqual(2);

    for (const seed of SEED_METHODOLOGIES) {
      for (const step of seed.body.steps) {
        if (step.conditional) {
          expect(step.trigger, `${seed.name} / ${step.title}`).toBeTruthy();
        } else {
          expect(step.trigger).toBeNull();
        }
      }
    }
  });

  it("至少 1 个为严格顺序，至少 1 个带概念", () => {
    expect(SEED_METHODOLOGIES.some((seed) => seed.body.orderMode === "strict")).toBe(true);
    expect(SEED_METHODOLOGIES.some((seed) => seed.body.concepts.length > 0)).toBe(true);
  });

  it("向领导提加薪含“对方以预算为由拒绝”的条件步骤并带概念", () => {
    const raise = SEED_METHODOLOGIES.find((seed) => seed.name === "向领导提加薪")!;
    expect(raise.body.orderMode).toBe("strict");
    expect(
      raise.body.steps.some((step) => step.conditional && step.trigger?.includes("预算")),
    ).toBe(true);
    expect(raise.body.concepts.length).toBeGreaterThan(0);
  });

  it("拒绝额外工作请求含“对方施压”的条件步骤", () => {
    const refuse = SEED_METHODOLOGIES.find((seed) => seed.name === "拒绝额外工作请求")!;
    expect(
      refuse.body.steps.some((step) => step.conditional && step.trigger?.includes("施压")),
    ).toBe(true);
  });

  it("节点 ID 唯一，概念关联的步骤真实存在", () => {
    for (const seed of SEED_METHODOLOGIES) {
      const ids = [
        ...seed.body.applicability.map((item) => item.id),
        ...seed.body.counterIndications.map((item) => item.id),
        ...seed.body.steps.flatMap((step) => [
          step.id,
          ...step.keyPoints.map((keyPoint) => keyPoint.id),
        ]),
        ...seed.body.principles.map((principle) => principle.id),
        ...seed.body.concepts.map((concept) => concept.id),
      ];
      expect(new Set(ids).size, seed.name).toBe(ids.length);

      const stepIds = new Set(seed.body.steps.map((step) => step.id));
      for (const concept of seed.body.concepts) {
        for (const relatedStepId of concept.relatedStepIds) {
          expect(stepIds.has(relatedStepId), `${seed.name} / ${concept.name}`).toBe(true);
        }
      }
    }
  });
});
