import { z } from "zod";

import type { MethodologyBody } from "@/domain/schemas";
import { ExcerptMatch } from "@/domain/schemas";
import type {
  MethodologyCreatedBy,
  MethodologyStatus,
} from "@/server/db/schema";

/** 方法论库的客户端 DTO 与保存入参。 */

export interface MethodologyListItemDto {
  id: string;
  name: string;
  status: MethodologyStatus;
  createdBy: MethodologyCreatedBy;
  tags: string[];
  sourceId: string | null;
  sourceTitle: string | null;
  stepCount: number;
  /** AI 推断（原文没有明说）的节点数。 */
  inferredCount: number;
  /** 有摘录但未能在原文中找到的节点数。 */
  unmatchedExcerptCount: number;
  version: number;
  updatedAt: number;
}

export interface OriginChunkDto {
  id: string;
  sourceId: string;
  title: string;
}

export interface MethodologyDetailDto {
  id: string;
  name: string;
  status: MethodologyStatus;
  createdBy: MethodologyCreatedBy;
  tags: string[];
  sourceId: string | null;
  sourceTitle: string | null;
  body: MethodologyBody;
  originChunks: OriginChunkDto[];
  mergedIntoId: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
}

/**
 * 保存入参（PUT /api/methodologies/[id]）：
 * 与 MethodologyBody 同形，但节点 id 可省略（新节点由服务端补 id），文本允许为空
 * （编辑中的 draft 也能保存）；严格校验在确认入库时进行。
 */
const nodeIn = {
  id: z.string().optional(),
  excerpt: z
    .object({ text: z.string(), chunkId: z.string().nullable(), match: ExcerptMatch })
    .nullable(),
  inferred: z.boolean(),
};

const StepIn = z.object({
  ...nodeIn,
  title: z.string(),
  description: z.string(),
  conditional: z.boolean(),
  trigger: z.string().nullable(),
  keyPoints: z.array(z.object({ ...nodeIn, text: z.string() })),
  exampleLines: z.array(z.string()),
  commonMistakes: z.array(z.string()),
});

export const MethodologyBodyInput = z.object({
  summary: z.string(),
  goal: z.string(),
  applicability: z.array(z.object({ ...nodeIn, text: z.string() })),
  counterIndications: z.array(z.object({ ...nodeIn, text: z.string() })),
  orderMode: z.enum(["strict", "loose"]),
  steps: z.array(StepIn),
  principles: z.array(z.object({ ...nodeIn, kind: z.enum(["do", "dont"]), text: z.string() })),
  concepts: z.array(
    z.object({
      ...nodeIn,
      name: z.string(),
      explanation: z.string(),
      relatedStepIds: z.array(z.string()),
    }),
  ),
});
export type MethodologyBodyInput = z.infer<typeof MethodologyBodyInput>;

export const SaveMethodologyInput = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  body: MethodologyBodyInput,
});
export type SaveMethodologyInput = z.infer<typeof SaveMethodologyInput>;

export const SplitInput = z.object({ stepIds: z.array(z.string()).min(1, "请至少选择 1 个步骤") });

export const MergeMethodologiesInput = z.object({ ids: z.array(z.string()).min(2, "至少需要选择 2 个候选方法论") });
