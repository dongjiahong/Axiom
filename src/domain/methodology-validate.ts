import type { MethodologyBody, SourceExcerpt } from "./schemas";

/**
 * 确认入库前的校验（api-and-ui.md §2.2）。
 * 返回中文问题列表，path 为表单字段路径，便于界面定位到对应字段；空数组表示可以确认。
 */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** 带原文摘录的节点（步骤、要点、适用条件、原则、概念）。 */
interface Node {
  excerpt: SourceExcerpt | null;
  inferred: boolean;
}

function checkNode(node: Node, path: string, label: string, issues: ValidationIssue[]): void {
  if (node.inferred && node.excerpt !== null) {
    issues.push({
      path: `${path}.excerpt`,
      message: `${label}标记为 AI 推断，不应附带原文摘录`,
    });
  }
}

export function validateMethodologyForConfirm(input: {
  name: string;
  body: MethodologyBody;
}): ValidationIssue[] {
  const { name, body } = input;
  const issues: ValidationIssue[] = [];

  if (name.trim() === "") {
    issues.push({ path: "name", message: "方法论名称不能为空" });
  }

  if (body.applicability.length === 0) {
    issues.push({ path: "applicability", message: "至少需要 1 条适用条件" });
  }
  body.applicability.forEach((item, i) => {
    if (item.text.trim() === "") {
      issues.push({ path: `applicability[${i}].text`, message: "适用条件不能为空" });
    }
    checkNode(item, `applicability[${i}]`, `适用条件 ${i + 1}`, issues);
  });
  body.counterIndications.forEach((item, i) => {
    checkNode(item, `counterIndications[${i}]`, `反例 ${i + 1}`, issues);
  });

  if (!body.steps.some((step) => !step.conditional)) {
    issues.push({ path: "steps", message: "至少需要 1 个非条件步骤" });
  }

  body.steps.forEach((step, i) => {
    const path = `steps[${i}]`;
    const label = `步骤「${step.title}」`;
    if (step.keyPoints.length === 0) {
      issues.push({ path: `${path}.keyPoints`, message: `${label}至少需要 1 个要点` });
    }
    step.keyPoints.forEach((keyPoint, j) => {
      checkNode(keyPoint, `${path}.keyPoints[${j}]`, `${label}的要点 ${j + 1}`, issues);
    });
    if (step.conditional && (step.trigger ?? "").trim() === "") {
      issues.push({ path: `${path}.trigger`, message: `条件步骤「${step.title}」必须填写触发条件` });
    }
    checkNode(step, path, label, issues);
  });

  body.principles.forEach((principle, i) => {
    checkNode(principle, `principles[${i}]`, `原则 ${i + 1}`, issues);
  });
  body.concepts.forEach((concept, i) => {
    checkNode(concept, `concepts[${i}]`, `概念「${concept.name}」`, issues);
  });

  return issues;
}
