import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { MethodologySnapshot } from "@/domain/schemas";
import { db, type AppDatabase } from "@/server/db/client";
import {
  messages,
  methodologies,
  practiceSessions,
  scenarios,
} from "@/server/db/schema";
import {
  toSessionDto,
  toSkeletonDto,
  type CreatePracticeInput,
  type MethodologySkeletonDto,
  type SessionDto,
} from "@/server/dto/session";
import { tagNamesByMethodology } from "@/server/extraction/drafts";
import { ApiError } from "@/server/http";
import { getPracticeSettings } from "@/server/llm/settings";

import { generateScenario, type ScenarioServiceOptions } from "./scenarios";

/** 练习会话：创建、选择、开始、查看提示（api-and-ui.md §2.3）。对话与复盘由后续工作包实现。 */

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
