import { z } from "zod";

import { MESSAGE_MAX_CHARS } from "@/domain/constants";
import {
  Difficulty,
  PracticeMode,
  Scope,
  SelectionMode,
  type CounterpartBrief,
  type EndReason,
  type MessageMeta,
  type MethodologyBody,
  type MethodologySnapshot,
} from "@/domain/schemas";
import type { MessageRole, SessionStatus } from "@/server/db/schema";

/**
 * 练习会话的客户端 DTO（data-model.md §4）。
 * 隐藏字段只在 debriefed / debrief_failed 状态下才会出现在结果里（键本身不存在，而不是 null），
 * 综合测验在复盘前也不下发目标方法论与候选方法论的正文。
 */

export const CreatePracticeInput = z.object({
  mode: PracticeMode,
  selection: SelectionMode,
  methodologyId: z.string().min(1).optional(),
  scope: Scope,
  difficulty: Difficulty,
});
export type CreatePracticeInput = z.infer<typeof CreatePracticeInput>;

export const SelectMethodologyInput = z.object({ methodologyId: z.string().min(1) });

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

export interface CandidateDto {
  id: string;
  name: string;
  tags: string[];
}

export interface SessionDto {
  id: string;
  mode: PracticeMode;
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
  /** 专项练习创建时 = 目标；综合测验为用户在 briefing 阶段的选择。 */
  selectedMethodologyId: string | null;
  messages: SessionMessageDto[];
  /** 仅综合测验：候选列表，按名称排序，只含 id、名称、标签。 */
  candidates?: CandidateDto[];

  // 以下键：专项练习始终下发目标；综合测验只在复盘后下发。
  targetMethodologyId?: string;
  targetMethodologyName?: string;
  // 以下键只在复盘后（debriefed / debrief_failed）下发。
  brief?: CounterpartBrief;
  designNotes?: string;
  alternatives?: { methodologyId: string; name: string; reason: string }[];
  targetSkeleton?: MethodologySkeletonDto;
}

export interface SessionRows {
  session: {
    id: string;
    mode: PracticeMode;
    status: SessionStatus;
    hintUsed: boolean;
    maxTurns: number;
    endReason: EndReason | null;
    endNote: string | null;
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    selectedMethodologyId: string | null;
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
    alternatives: { methodologyId: string; reason: string }[];
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
  /** 候选方法论（综合测验）。 */
  candidates: CandidateDto[];
  /** 方法论 ID → 名称，用于目标与备选方法论。 */
  names: Map<string, string>;
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
    mode: session.mode,
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
    selectedMethodologyId: session.selectedMethodologyId,
    messages: rows.messages.map((m) => toMessageDto(m, revealed)),
  };

  if (session.mode === "quiz") {
    dto.candidates = [...rows.candidates].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  if (session.mode === "drill" || revealed) {
    dto.targetMethodologyId = scenario.targetMethodologyId;
    dto.targetMethodologyName = rows.names.get(scenario.targetMethodologyId) ?? "";
  }

  if (revealed) {
    dto.brief = scenario.brief;
    dto.designNotes = scenario.designNotes;
    dto.alternatives = scenario.alternatives.map((alt) => ({
      methodologyId: alt.methodologyId,
      name: rows.names.get(alt.methodologyId) ?? "",
      reason: alt.reason,
    }));
    if (session.targetSnapshot) {
      dto.targetSkeleton = toSkeletonDto(session.targetSnapshot.name, session.targetSnapshot.body);
    }
  }

  return dto;
}
