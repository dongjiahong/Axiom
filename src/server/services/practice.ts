import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { EndReason, MessageMeta, MethodologySnapshot } from "@/domain/schemas";
import { db, type AppDatabase } from "@/server/db/client";
import {
  messages,
  methodologies,
  practiceSessions,
  scenarios,
} from "@/server/db/schema";
import {
  SendMessageInput,
  toMessageDto,
  toSessionDto,
  toSkeletonDto,
  type CreatePracticeInput,
  type MessageResultDto,
  type MethodologySkeletonDto,
  type SessionDto,
} from "@/server/dto/session";
import { tagNamesByMethodology } from "@/server/extraction/drafts";
import { ApiError } from "@/server/http";
import { getPracticeSettings } from "@/server/llm/settings";
import { runTask, type TaskContext } from "@/server/llm/run-task";
import {
  counterpartTask,
  type CounterpartInput,
  type CounterpartOutput,
} from "@/server/prompts/counterpart";

import { generateScenario, type ScenarioServiceOptions } from "./scenarios";

/** 练习会话：创建、选择、开始、查看提示、对话与结束（api-and-ui.md §2.3）。复盘由后续工作包实现。 */

type SessionRow = typeof practiceSessions.$inferSelect;
type ScenarioRow = typeof scenarios.$inferSelect;
type MethodologyRow = typeof methodologies.$inferSelect;

function loadSession(database: AppDatabase, id: string): SessionRow {
  const row = database.select().from(practiceSessions).where(eq(practiceSessions.id, id)).get();
  if (!row) throw new ApiError(404, "not_found", "练习不存在");
  return row;
}

function loadScenario(database: AppDatabase, id: string): ScenarioRow {
  return database.select().from(scenarios).where(eq(scenarios.id, id)).get() as ScenarioRow;
}

// ───────────── 创建 ─────────────

/** 选题 → 生成场景 → 新建 briefing 状态的练习。 */
export async function createPractice(
  params: CreatePracticeInput,
  options: ScenarioServiceOptions = {},
): Promise<{ sessionId: string }> {
  const database = options.database ?? db;
  const scenarioId = await generateScenario(params, options);
  const scenario = loadScenario(database, scenarioId);

  const sessionId = nanoid();
  database
    .insert(practiceSessions)
    .values({
      id: sessionId,
      scenarioId,
      mode: params.mode,
      status: "briefing",
      selectedMethodologyId: params.mode === "drill" ? scenario.targetMethodologyId : null,
      hintUsed: false,
      maxTurns: getPracticeSettings(database).maxTurns,
      createdAt: Date.now(),
    })
    .run();
  return { sessionId };
}

// ───────────── 读取 ─────────────

export function getSession(id: string, database: AppDatabase = db): SessionDto {
  const session = loadSession(database, id);
  const scenario = loadScenario(database, session.scenarioId);
  const messageRows = database
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.seq))
    .all();

  const namedIds = [
    ...new Set([
      scenario.targetMethodologyId,
      ...scenario.alternatives.map((alt) => alt.methodologyId),
      ...(session.mode === "quiz" ? scenario.candidateIds : []),
    ]),
  ];
  const methodologyRows = database
    .select({ id: methodologies.id, name: methodologies.name })
    .from(methodologies)
    .where(inArray(methodologies.id, namedIds))
    .all();
  const names = new Map(methodologyRows.map((row) => [row.id, row.name]));
  const tagMap = tagNamesByMethodology(database, scenario.candidateIds);

  return toSessionDto({
    session,
    scenario,
    messages: messageRows,
    candidates:
      session.mode === "quiz"
        ? scenario.candidateIds.map((cid) => ({
            id: cid,
            name: names.get(cid) ?? "",
            tags: tagMap.get(cid) ?? [],
          }))
        : [],
    names,
  });
}

// ───────────── 选择 / 开始 / 提示 ─────────────

/** 综合测验：在 briefing 阶段选择（可多次修改）所用方法论，必须在候选列表中。 */
export function selectMethodology(
  id: string,
  methodologyId: string,
  database: AppDatabase = db,
): SessionDto {
  const session = loadSession(database, id);
  if (session.mode !== "quiz") {
    throw new ApiError(409, "invalid_state", "只有综合测验需要选择方法论");
  }
  if (session.status !== "briefing") {
    throw new ApiError(409, "invalid_state", "练习已经开始，不能再修改所选方法论");
  }
  const scenario = loadScenario(database, session.scenarioId);
  if (!scenario.candidateIds.includes(methodologyId)) {
    throw new ApiError(400, "invalid_input", "所选方法论不在候选列表中");
  }
  database
    .update(practiceSessions)
    .set({ selectedMethodologyId: methodologyId })
    .where(eq(practiceSessions.id, id))
    .run();
  return getSession(id, database);
}

function snapshotOf(database: AppDatabase, row: MethodologyRow): MethodologySnapshot {
  return {
    methodologyId: row.id,
    version: row.version,
    name: row.name,
    tags: tagNamesByMethodology(database, [row.id]).get(row.id) ?? [],
    body: row.body,
  };
}

function loadConfirmedRow(database: AppDatabase, id: string): MethodologyRow {
  const row = database.select().from(methodologies).where(eq(methodologies.id, id)).get();
  if (!row || row.status !== "confirmed") {
    throw new ApiError(409, "invalid_state", "所需的方法论已不在方法论库中（可能已被退回或归档），无法开始");
  }
  return row;
}

/** briefing → active：写入快照与开始时间；对方先开口时插入开场白（turn 0）。 */
export function startSession(id: string, database: AppDatabase = db): SessionDto {
  const session = loadSession(database, id);
  if (session.status !== "briefing") {
    throw new ApiError(409, "invalid_state", "练习已经开始");
  }
  if (!session.selectedMethodologyId) {
    throw new ApiError(409, "invalid_state", "请先选择你要使用的方法论");
  }
  const scenario = loadScenario(database, session.scenarioId);
  const targetSnapshot = snapshotOf(database, loadConfirmedRow(database, scenario.targetMethodologyId));
  const selectedSnapshot =
    session.selectedMethodologyId === scenario.targetMethodologyId
      ? targetSnapshot
      : snapshotOf(database, loadConfirmedRow(database, session.selectedMethodologyId));

  const now = Date.now();
  database.transaction((tx) => {
    tx.update(practiceSessions)
      .set({ status: "active", targetSnapshot, selectedSnapshot, startedAt: now })
      .where(and(eq(practiceSessions.id, id), eq(practiceSessions.status, "briefing")))
      .run();
    if (scenario.openingSpeaker === "counterpart" && scenario.openingLine) {
      tx.insert(messages)
        .values({
          id: nanoid(),
          sessionId: id,
          seq: 1,
          role: "counterpart",
          turn: 0,
          content: scenario.openingLine,
          meta: null,
          createdAt: now,
        })
        .run();
    }
  });
  return getSession(id, database);
}

/** 专项练习：查看方法论骨架，并记录 hintUsed。综合测验不提供提示。 */
export function requestHint(id: string, database: AppDatabase = db): MethodologySkeletonDto {
  const session = loadSession(database, id);
  if (session.mode !== "drill") {
    throw new ApiError(409, "invalid_state", "综合测验不提供方法论提示");
  }
  if (session.status !== "briefing" && session.status !== "active") {
    throw new ApiError(409, "invalid_state", "练习已结束，不能再查看提示");
  }
  database
    .update(practiceSessions)
    .set({ hintUsed: true })
    .where(eq(practiceSessions.id, id))
    .run();

  // 开始后以冻结的快照为准；开始前取方法论当前内容。
  if (session.targetSnapshot) return toSkeletonDto(session.targetSnapshot.name, session.targetSnapshot.body);
  const scenario = loadScenario(database, session.scenarioId);
  const row = database
    .select()
    .from(methodologies)
    .where(eq(methodologies.id, scenario.targetMethodologyId))
    .get() as MethodologyRow;
  return toSkeletonDto(row.name, row.body);
}

// ───────────── 对话 ─────────────

type MessageRow = typeof messages.$inferSelect;

/** 对方回复任务的入口；默认走 runTask，测试可替换为桩。 */
export type CounterpartFn = (
  input: CounterpartInput,
  ctx: TaskContext,
) => Promise<CounterpartOutput>;

export interface DialogueOptions {
  database?: AppDatabase;
  signal?: AbortSignal;
  counterpart?: CounterpartFn;
}

const runCounterpart: CounterpartFn = (input, ctx) => runTask(counterpartTask, input, ctx);

function loadMessages(database: AppDatabase, sessionId: string): MessageRow[] {
  return database
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))
    .all();
}

function lastMessage(database: AppDatabase, sessionId: string): MessageRow | undefined {
  return database
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.seq))
    .limit(1)
    .get();
}

function requireActive(session: SessionRow, action: string): void {
  if (session.status !== "active") {
    throw new ApiError(409, "invalid_state", `练习不在进行中，不能${action}`);
  }
}

const REGENERATE_HINT = "上一条回复生成失败，请先点击“重试生成回复”";

function sessionSummary(
  session: Pick<SessionRow, "status" | "endReason" | "endNote" | "maxTurns">,
  turn: number,
): MessageResultDto["session"] {
  return {
    status: session.status,
    endReason: session.endReason,
    endNote: session.endNote,
    turn,
    maxTurns: session.maxTurns,
  };
}

/**
 * 为最后一条用户消息生成对方回复并落库，然后判断是否结束（对方宣告结束优先，其次轮数上限）。
 * 生成失败时不改动任何数据，用户消息保留。
 */
async function replyToLastUserMessage(
  database: AppDatabase,
  sessionId: string,
  options: DialogueOptions,
): Promise<Pick<MessageResultDto, "messages"> & { session: MessageResultDto["session"] }> {
  const session = loadSession(database, sessionId);
  requireActive(session, "生成回复");
  const history = loadMessages(database, sessionId);
  const last = history.at(-1);
  if (!last || last.role !== "user") {
    throw new ApiError(409, "invalid_state", "没有需要回复的用户消息");
  }
  const scenario = loadScenario(database, session.scenarioId);

  const output = await (options.counterpart ?? runCounterpart)(
    {
      scenario: {
        userRole: scenario.userRole,
        background: scenario.background,
        counterpart: { name: scenario.counterpartName, relation: scenario.counterpartRelation },
        brief: scenario.brief,
      },
      difficulty: scenario.difficulty,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      turn: last.turn,
      maxTurns: session.maxTurns,
    },
    { refType: "session", refId: sessionId, signal: options.signal },
  );

  return database.transaction((tx) => {
    // 生成期间用户可能已手动结束，或并发地重复触发了生成
    const current = loadSession(tx, sessionId);
    requireActive(current, "保存回复");
    if (lastMessage(tx, sessionId)?.id !== last.id) {
      throw new ApiError(409, "invalid_state", "对话已发生变化，请刷新后重试");
    }

    const meta: MessageMeta = { firedResistanceIds: output.firedResistanceIds, end: output.end };
    const now = Date.now();
    const reply: MessageRow = {
      id: nanoid(),
      sessionId,
      seq: last.seq + 1,
      role: "counterpart",
      turn: last.turn,
      content: output.reply,
      meta,
      createdAt: now,
    };
    tx.insert(messages).values(reply).run();

    let end: { reason: EndReason; note: string | null } | null = null;
    if (output.end) end = { reason: output.end.type, note: output.end.note };
    else if (last.turn >= current.maxTurns) end = { reason: "turn_limit", note: null };

    const updated = end
      ? { ...current, status: "ended" as const, endReason: end.reason, endNote: end.note }
      : current;
    if (end) {
      tx.update(practiceSessions)
        .set({ status: "ended", endReason: end.reason, endNote: end.note, endedAt: now })
        .where(eq(practiceSessions.id, sessionId))
        .run();
    }
    return { messages: [toMessageDto(reply, false)], session: sessionSummary(updated, last.turn) };
  });
}

/** 发消息（active）：保存用户消息 → 生成对方回复 → 判断结束。 */
export async function sendMessage(
  id: string,
  content: string,
  options: DialogueOptions = {},
): Promise<MessageResultDto> {
  const database = options.database ?? db;
  const parsed = SendMessageInput.safeParse({ content });
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "消息不合法");
  }

  const session = loadSession(database, id);
  requireActive(session, "发送消息");
  const last = lastMessage(database, id);
  if (last?.role === "user") throw new ApiError(409, "invalid_state", REGENERATE_HINT);
  const userCount = loadMessages(database, id).filter((m) => m.role === "user").length;
  if (userCount >= session.maxTurns) {
    throw new ApiError(409, "invalid_state", "已到达轮数上限");
  }

  const userMessage: MessageRow = {
    id: nanoid(),
    sessionId: id,
    seq: (last?.seq ?? 0) + 1,
    role: "user",
    turn: userCount + 1,
    content: parsed.data.content,
    meta: null,
    createdAt: Date.now(),
  };
  database.insert(messages).values(userMessage).run();

  const reply = await replyToLastUserMessage(database, id, options);
  return { messages: [toMessageDto(userMessage, false), ...reply.messages], session: reply.session };
}

/** 重试生成回复：仅当最后一条是用户消息（上次生成失败）时可用。 */
export async function regenerateReply(
  id: string,
  options: DialogueOptions = {},
): Promise<MessageResultDto> {
  const database = options.database ?? db;
  return replyToLastUserMessage(database, id, options);
}

/** 手动结束：至少有 1 条用户消息才保留，否则直接删除会话。 */
export function endSession(
  id: string,
  database: AppDatabase = db,
): SessionDto | { deleted: true } {
  const session = loadSession(database, id);
  requireActive(session, "结束");
  const hasUserMessage = loadMessages(database, id).some((m) => m.role === "user");
  if (!hasUserMessage) {
    database.delete(practiceSessions).where(eq(practiceSessions.id, id)).run();
    return { deleted: true };
  }
  database
    .update(practiceSessions)
    .set({ status: "ended", endReason: "user", endNote: null, endedAt: Date.now() })
    .where(eq(practiceSessions.id, id))
    .run();
  return getSession(id, database);
}
