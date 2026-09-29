import type { MethodologyBody } from "@/domain/schemas";
import type { MethodologyCreatedBy, MethodologyStatus } from "@/server/db/schema";

/** 资料详情页展示的候选方法论与合并建议。 */

export interface SourceDraftDto {
  id: string;
  name: string;
  status: MethodologyStatus;
  createdBy: MethodologyCreatedBy;
  tags: string[];
  stepCount: number;
  /** AI 推断（原文没有明说）的节点数。 */
  inferredCount: number;
  /** 有摘录但未能在原文中找到的节点数。 */
  unmatchedExcerptCount: number;
}

export interface MergeSuggestionDto {
  id: string;
  sourceId: string;
  reason: string;
  members: { id: string; name: string }[];
}

/** 统计方法论正文中的推断节点与未匹配摘录。 */
export function countBodyMarks(body: MethodologyBody): {
  inferredCount: number;
  unmatchedExcerptCount: number;
} {
  const nodes = [
    ...body.applicability,
    ...body.counterIndications,
    ...body.steps,
    ...body.steps.flatMap((step) => step.keyPoints),
    ...body.principles,
    ...body.concepts,
  ];
  return {
    inferredCount: nodes.filter((n) => n.inferred).length,
    unmatchedExcerptCount: nodes.filter((n) => n.excerpt?.match === "none").length,
  };
}
