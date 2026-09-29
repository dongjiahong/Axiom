import { nanoid } from "nanoid";

import type { MethodologyBody } from "@/domain/schemas";
import { matchExcerpt, type Haystack } from "@/domain/text-match";
import type { AiMethodology } from "@/server/prompts/extract-chunk";

/** AI 输出 ↔ 领域模型的映射（分配 ID、核对摘录、短引用还原）。无 IO。 */

interface AiNodeLike {
  excerpt: string | null;
  inferred: boolean;
}

/**
 * 非推断节点的摘录在 haystacks 中核对；核对成功时 text 替换为资料真实原文。
 * AI 没有给出摘录的节点按"推断内容"处理（没有原文依据，审阅时需重点核对）。
 */
function toNode(node: AiNodeLike, haystacks: Haystack[]) {
  const excerpt = node.excerpt?.trim();
  if (node.inferred || !excerpt) return { id: nanoid(), inferred: true, excerpt: null };
  return { id: nanoid(), inferred: false, excerpt: matchExcerpt(excerpt, haystacks) };
}

export function aiToBody(ai: AiMethodology, haystacks: Haystack[]): MethodologyBody {
  const steps = ai.steps.map((step) => ({
    ...toNode(step, haystacks),
    title: step.title,
    description: step.description,
    conditional: step.conditional,
    trigger: step.conditional ? (step.trigger?.trim() ?? null) : null,
    keyPoints: step.keyPoints.map((kp) => ({ ...toNode(kp, haystacks), text: kp.text })),
    exampleLines: step.exampleLines,
    commonMistakes: step.commonMistakes,
  }));

  return {
    summary: ai.summary,
    goal: ai.goal,
    applicability: ai.applicability.map((item) => ({ ...toNode(item, haystacks), text: item.text })),
    counterIndications: ai.counterIndications.map((item) => ({
      ...toNode(item, haystacks),
      text: item.text,
    })),
    orderMode: ai.orderMode,
    steps,
    principles: ai.principles.map((p) => ({ ...toNode(p, haystacks), kind: p.kind, text: p.text })),
    concepts: ai.concepts.map((c) => ({
      ...toNode(c, haystacks),
      name: c.name,
      explanation: c.explanation,
      relatedStepIds: [...new Set(c.relatedStepIndexes)]
        .filter((index) => index >= 0 && index < steps.length)
        .map((index) => steps[index].id),
    })),
  };
}

function excerptText(node: { excerpt: { text: string } | null }): string | null {
  return node.excerpt?.text ?? null;
}

/** 已入库的方法论 → 合并任务的输入（去掉 ID，摘录保留原文）。 */
export function bodyToAi(body: MethodologyBody, name: string, tagNames: string[]): AiMethodology {
  const stepIds = body.steps.map((step) => step.id);
  const node = (n: { excerpt: { text: string } | null; inferred: boolean }) => ({
    excerpt: excerptText(n),
    inferred: n.inferred,
  });
  return {
    name,
    summary: body.summary,
    goal: body.goal,
    applicability: body.applicability.map((item) => ({ text: item.text, ...node(item) })),
    counterIndications: body.counterIndications.map((item) => ({ text: item.text, ...node(item) })),
    orderMode: body.orderMode,
    steps: body.steps.map((step) => ({
      title: step.title,
      description: step.description,
      conditional: step.conditional,
      trigger: step.trigger,
      keyPoints: step.keyPoints.map((kp) => ({ text: kp.text, ...node(kp) })),
      exampleLines: step.exampleLines,
      commonMistakes: step.commonMistakes,
      ...node(step),
    })),
    principles: body.principles.map((p) => ({ kind: p.kind, text: p.text, ...node(p) })),
    concepts: body.concepts.map((c) => ({
      name: c.name,
      explanation: c.explanation,
      relatedStepIndexes: c.relatedStepIds
        .map((id) => stepIds.indexOf(id))
        .filter((index) => index >= 0),
      ...node(c),
    })),
    suggestedTags: tagNames.slice(0, 3),
  };
}

/** 标签归一化：去掉所有空白，丢弃空标签，合并同名，保持首次出现的顺序。 */
export function normalizeTagNames(names: string[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    const cleaned = name.replace(/\s+/g, "");
    if (cleaned && !result.includes(cleaned)) result.push(cleaned);
  }
  return result;
}
