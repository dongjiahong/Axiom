import { z } from "zod";

import { MESSAGE_MAX_CHARS } from "@/domain/constants";
import {
  Difficulty,
  Scope,
  SelectionMode,
  type CounterpartBrief,
  type EndReason,
  type MessageMeta,
  type MethodologyBody,
  type MethodologySnapshot,
  type Outcome,
} from "@/domain/schemas";
import type { MessageRole, SessionStatus } from "@/server/db/schema";

/**
 * 练习会话的客户端 DTO。
 * 隐藏字段只在 debriefed / debrief_failed 状态下才会出现在结果里（键本身不存在，而不是 null）。
 */

export const CreatePracticeInput = z.object({
  selection: SelectionMode,
  methodologyId: z.string().min(1).optional(),
  scope: Scope,
  difficulty: Difficulty,
});
export type CreatePracticeInput = z.infer<typeof CreatePracticeInput>;

/** 历史列表的分页参数。 */
export const SessionListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  /** 只列出还没复盘完成的练习（准备中、进行中、已结束、复盘失败）。 */
  unfinished: z
    .enum(["true"])
    .optional()
    .transform((value) => value === "true"),
});
export type SessionListQuery = z.infer<typeof SessionListQuery>;

export const SendMessageInput = z.object({
  content: z
    .string()
    .trim()
    .min(1, "消息不能为空")
    .max(MESSAGE_MAX_CHARS, `消息不能超过 ${MESSAGE_MAX_CHARS} 字`),
});

/** 方法论骨架：只含练习时需要看的内容，不含原文摘录。 */
export interface MethodologySkeletonDto {
  name: string;
  summary: string;
  goal: string;
  applicability: string[];
  counterIndications: string[];
  orderMode: MethodologyBody["orderMode"];
  steps: {
    title: string;
    description: string;
    conditional: boolean;
    trigger: string | null;
    keyPoints: string[];
    exampleLines: string[];
    commonMistakes: string[];
  }[];
  principles: { kind: "do" | "dont"; text: string }[];
  concepts: { name: string; explanation: string }[];
}

export function toSkeletonDto(name: string, body: MethodologyBody): MethodologySkeletonDto {
  return {
    name,
    summary: body.summary,
    goal: body.goal,
    applicability: body.applicability.map((item) => item.text),
    counterIndications: body.counterIndications.map((item) => item.text),
    orderMode: body.orderMode,
    steps: body.steps.map((step) => ({
      title: step.title,
      description: step.description,
      conditional: step.conditional,
      trigger: step.trigger,
      keyPoints: step.keyPoints.map((kp) => kp.text),
      exampleLines: step.exampleLines,
      commonMistakes: step.commonMistakes,
    })),
    principles: body.principles.map((p) => ({ kind: p.kind, text: p.text })),
    concepts: body.concepts.map((c) => ({ name: c.name, explanation: c.explanation })),
  };
}

export interface SessionMessageDto {
  id: string;
  seq: number;
  role: MessageRole;
  turn: number;
  content: string;
  /** 仅复盘后下发。 */
  meta?: MessageMeta | null;
}

/** 发消息 / 重试生成回复的结果：新增的消息与会话的最新状态。 */
export interface MessageResultDto {
  messages: SessionMessageDto[];
  session: {
    status: SessionStatus;
    endReason: EndReason | null;
    endNote: string | null;
    turn: number;
    maxTurns: number;
  };
}

/** 历史列表 / 首页「最近练习」的单条记录。 */
export interface SessionListItemDto {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  difficulty: Difficulty;
  status: SessionStatus;
  createdAt: number;
  endedAt: number | null;
  /** 所用的目标方法论名称。 */
  methodologyName: string;
  executionScore: number | null;
  outcome: Outcome | null;
}

export interface SessionListDto {
  items: SessionListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SessionDto {
  id: string;
  status: SessionStatus;
  difficulty: Difficulty;
  hintUsed: boolean;
  maxTurns: number;
  /** 已有的用户发言数。 */
  turn: number;
  endReason: EndReason | null;
  endNote: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  scenario: {
    id: string;
    title: string;
    background: string;
    userRole: string;
    userGoal: string;
    counterpart: { name: string; relation: string; profile: string };
    openingSpeaker: "counterpart" | "user";
    openingLine: string | null;
  };
  targetMethodologyId: string;
  targetMethodologyName: string;
  messages: SessionMessageDto[];

  // 以下键只在复盘后（debriefed / debrief_failed）下发。
  brief?: CounterpartBrief;
  designNotes?: string;
  targetSkeleton?: MethodologySkeletonDto;
}

export interface SessionRows {
  session: {
    id: string;
    status: SessionStatus;
    hintUsed: boolean;
    maxTurns: number;
    endReason: EndReason | null;
    endNote: string | null;
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    targetSnapshot: MethodologySnapshot | null;
  };
  scenario: {
    id: string;
    targetMethodologyId: string;
    difficulty: Difficulty;
    title: string;
    background: string;
    userRole: string;
    userGoal: string;
    counterpartName: string;
    counterpartRelation: string;
    counterpartProfile: string;
    openingSpeaker: "counterpart" | "user";
    openingLine: string | null;
    brief: CounterpartBrief;
    designNotes: string;
  };
  messages: {
    id: string;
    seq: number;
    role: MessageRole;
    turn: number;
    content: string;
    meta: MessageMeta | null;
  }[];
  /** 目标方法论名称。 */
  targetName: string;
}

/** 单条消息 DTO；`meta` 只在揭晓后下发。 */
export function toMessageDto(m: SessionRows["messages"][number], revealed: boolean): SessionMessageDto {
  return {
    id: m.id,
    seq: m.seq,
    role: m.role,
    turn: m.turn,
    content: m.content,
    ...(revealed ? { meta: m.meta } : {}),
  };
}

/** 是否已到可以揭晓隐藏字段的阶段。 */
export function isRevealed(status: SessionStatus): boolean {
  return status === "debriefed" || status === "debrief_failed";
}

export function toSessionDto(rows: SessionRows): SessionDto {
  const { session, scenario } = rows;
  const revealed = isRevealed(session.status);

  const dto: SessionDto = {
    id: session.id,
    status: session.status,
    difficulty: scenario.difficulty,
    hintUsed: session.hintUsed,
    maxTurns: session.maxTurns,
    turn: rows.messages.filter((m) => m.role === "user").length,
    endReason: session.endReason,
    endNote: session.endNote,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      background: scenario.background,
      userRole: scenario.userRole,
      userGoal: scenario.userGoal,
      counterpart: {
        name: scenario.counterpartName,
        relation: scenario.counterpartRelation,
        profile: scenario.counterpartProfile,
      },
      openingSpeaker: scenario.openingSpeaker,
      openingLine: scenario.openingLine,
    },
    targetMethodologyId: scenario.targetMethodologyId,
    targetMethodologyName: rows.targetName,
    messages: rows.messages.map((m) => toMessageDto(m, revealed)),
  };

  if (revealed) {
    dto.brief = scenario.brief;
    dto.designNotes = scenario.designNotes;
    if (session.targetSnapshot) {
      dto.targetSkeleton = toSkeletonDto(session.targetSnapshot.name, session.targetSnapshot.body);
    }
  }

  return dto;
}
