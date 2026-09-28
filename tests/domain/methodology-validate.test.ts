import { describe, expect, it } from "vitest";

import { validateMethodologyForConfirm, type ValidationIssue } from "@/domain/methodology-validate";
import type { MethodologyBody } from "@/domain/schemas";
import { makeMethodologyBody, makeStep } from "../fixtures/methodology";

function validate(name: string, body: MethodologyBody): ValidationIssue[] {
  return validateMethodologyForConfirm({ name, body });
}

function paths(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => issue.path);
}

describe("validateMethodologyForConfirm", () => {
  it("规则齐备时通过", () => {
    expect(validate("向领导提加薪", makeMethodologyBody())).toEqual([]);
  });

  it("名称非空即可", () => {
    expect(validate("向领导提加薪", makeMethodologyBody())).toEqual([]);
  });

  it("名称为空或只有空白时报错", () => {
    expect(paths(validate("", makeMethodologyBody()))).toContain("name");
    expect(paths(validate("   ", makeMethodologyBody()))).toContain("name");
  });

  it("没有适用条件时报错", () => {
    const issues = validate("结论先行的工作汇报", makeMethodologyBody({ applicability: [] }));
    expect(paths(issues)).toContain("applicability");
    expect(issues.find((issue) => issue.path === "applicability")?.message).toBe(
      "至少需要 1 条适用条件",
    );
  });

  it("适用条件文本为空时报错", () => {
    const body = makeMethodologyBody({
      applicability: [{ id: "a1", excerpt: null, inferred: true, text: " " }],
    });
    expect(paths(validate("拒绝额外工作请求", body))).toContain("applicability[0].text");
  });

  it("只有条件步骤时报错", () => {
    const body = makeMethodologyBody({
      steps: [makeStep({ conditional: true, trigger: "对方拒绝时" })],
    });
    const issues = validate("向领导提加薪", body);
    expect(paths(issues)).toContain("steps");
    expect(issues.find((issue) => issue.path === "steps")?.message).toBe(
      "至少需要 1 个非条件步骤",
    );
  });

  it("步骤没有要点时报错", () => {
    const body = makeMethodologyBody({ steps: [makeStep({ keyPoints: [] })] });
    const issues = validate("先共情再建议的安慰法", body);
    expect(paths(issues)).toContain("steps[0].keyPoints");
  });

  it("条件步骤缺触发条件时报错", () => {
    const body = makeMethodologyBody({
      steps: [makeStep(), makeStep({ conditional: true, trigger: null })],
    });
    expect(paths(validate("拒绝额外工作请求", body))).toContain("steps[1].trigger");
  });

  it("条件步骤写了触发条件时通过", () => {
    const body = makeMethodologyBody({
      steps: [makeStep(), makeStep({ conditional: true, trigger: "对方施压要求接下来" })],
    });
    expect(validate("拒绝额外工作请求", body)).toEqual([]);
  });

  it("推断内容带原文摘录时报错（步骤、要点、适用条件、原则、概念）", () => {
    const excerpt = { text: "原文片段", chunkId: "c1", match: "exact" } as const;
    const body = makeMethodologyBody({
      applicability: [{ id: "a1", excerpt, inferred: true, text: "适用条件" }],
      steps: [
        makeStep({
          excerpt,
          inferred: true,
          keyPoints: [{ id: "k1", excerpt, inferred: true, text: "要点" }],
        }),
      ],
      principles: [{ id: "p1", excerpt, inferred: true, kind: "do", text: "原则" }],
      concepts: [
        {
          id: "c1",
          excerpt,
          inferred: true,
          name: "锚定效应",
          explanation: "解释",
          relatedStepIds: [],
        },
      ],
    });

    expect(paths(validate("向领导提加薪", body))).toEqual([
      "applicability[0].excerpt",
      "steps[0].keyPoints[0].excerpt",
      "steps[0].excerpt",
      "principles[0].excerpt",
      "concepts[0].excerpt",
    ]);
  });

  it("非推断节点带摘录时通过", () => {
    const excerpt = { text: "原文片段", chunkId: "c1", match: "exact" } as const;
    const body = makeMethodologyBody({
      steps: [
        makeStep({
          excerpt,
          inferred: false,
          keyPoints: [{ id: "k1", excerpt, inferred: false, text: "要点" }],
        }),
      ],
    });
    expect(validate("结论先行的工作汇报", body)).toEqual([]);
  });

  it("一次返回多条问题，并带字段路径", () => {
    const body = makeMethodologyBody({
      applicability: [],
      steps: [makeStep({ keyPoints: [] }), makeStep({ conditional: true, trigger: null })],
    });
    const issues = validate("", body);
    expect(paths(issues)).toEqual([
      "name",
      "applicability",
      "steps[0].keyPoints",
      "steps[1].trigger",
    ]);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });
});
