import { nanoid } from "nanoid";

import type { KeyPoint, MethodologyBody, Step } from "@/domain/schemas";

/** 测试用的方法论骨架构造器（没有资料来源，节点均为 inferred=true、excerpt=null）。 */

export function makeKeyPoint(text = "用具体数字说明成果"): KeyPoint {
  return { id: nanoid(), excerpt: null, inferred: true, text };
}

export function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: nanoid(),
    excerpt: null,
    inferred: true,
    title: "第一步",
    description: "说明",
    conditional: false,
    trigger: null,
    keyPoints: [makeKeyPoint()],
    exampleLines: [],
    commonMistakes: [],
    ...overrides,
  };
}

export function makeMethodologyBody(overrides: Partial<MethodologyBody> = {}): MethodologyBody {
  return {
    summary: "概要",
    goal: "目标",
    applicability: [{ id: nanoid(), excerpt: null, inferred: true, text: "适用条件" }],
    counterIndications: [],
    orderMode: "loose",
    steps: [makeStep()],
    principles: [],
    concepts: [],
    ...overrides,
  };
}
