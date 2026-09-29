import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import type {
  Alternative,
  CounterpartBrief,
  DebriefSummary,
  Difficulty,
  EndReason,
  Evidence,
  KeyPointVerdictValue,
  MethodologyBody,
  MethodologySnapshot,
  MessageMeta,
  ModelRewrite,
  Outcome,
  PracticeMode,
  PrincipleVerdictValue,
  Recognition,
  ScoreBreakdown,
  Scope,
} from "../../domain/schemas";

/**
 * 数据库表。
 * 主键为 nanoid（21 位）字符串，时间为 Unix 毫秒，JSON 列以 JSON 字符串存储。
 */

/** 资料格式。 */
export type SourceFormat = "epub" | "pdf" | "txt" | "md";
/** 资料状态。 */
export type SourceStatus = "parsing" | "ready" | "extracting" | "extracted" | "failed";
/** 章节块的抽取状态。 */
export type ExtractionStatus = "pending" | "running" | "done" | "failed" | "skipped";
/** 任务类型；MVP 仅有资料抽取。 */
export type JobType = "extract_source";
/** 任务状态。 */
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
/** 任务阶段。 */
export type JobStage = "chunks" | "cluster" | "merge" | "done";
/** 方法论状态。 */
export type MethodologyStatus = "draft" | "confirmed" | "archived";
/** 方法论的创建来源。 */
export type MethodologyCreatedBy = "extraction" | "merge" | "split" | "manual" | "seed";
/** 合并建议状态。 */
export type MergeSuggestionStatus = "open" | "accepted" | "dismissed";
/** 会话状态。 */
export type SessionStatus = "briefing" | "active" | "ended" | "debriefed" | "debrief_failed";
/** 消息角色。 */
export type MessageRole = "user" | "counterpart";
/** 判定类型。 */
export type VerdictKind = "key_point" | "principle";
/** AI 调用任务。 */
export type LLMTaskName =
  | "extract_chunk"
  | "cluster"
  | "merge"
  | "scenario"
  | "counterpart"
  | "debrief"
  | "test";
/** AI 调用结果。 */
export type LLMCallStatus = "ok" | "transport_error" | "invalid_output";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  updatedAt: integer("updatedAt").notNull(),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  format: text("format").$type<SourceFormat>().notNull(),
  originalFilename: text("originalFilename").notNull(),
  filePath: text("filePath").notNull(),
  charCount: integer("charCount").notNull(),
  status: text("status").$type<SourceStatus>().notNull(),
  error: text("error"),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
});

export const sourceChunks = sqliteTable(
  "source_chunks",
  {
    id: text("id").primaryKey(),
    sourceId: text("sourceId")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    charCount: integer("charCount").notNull(),
    extractionStatus: text("extractionStatus").$type<ExtractionStatus>().notNull(),
    extractionError: text("extractionError"),
    extractedAt: integer("extractedAt"),
  },
  (table) => [unique("source_chunks_source_seq_unique").on(table.sourceId, table.seq)],
);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").$type<JobType>().notNull(),
  payload: text("payload", { mode: "json" }).$type<{ sourceId: string }>().notNull(),
  status: text("status").$type<JobStatus>().notNull(),
  stage: text("stage").$type<JobStage>(),
  progressDone: integer("progressDone").notNull(),
  progressTotal: integer("progressTotal").notNull(),
  error: text("error"),
  createdAt: integer("createdAt").notNull(),
  startedAt: integer("startedAt"),
  finishedAt: integer("finishedAt"),
});

export const methodologies = sqliteTable("methodologies", {
  id: text("id").primaryKey(),
  sourceId: text("sourceId").references(() => sources.id, { onDelete: "set null" }),
  status: text("status").$type<MethodologyStatus>().notNull(),
  name: text("name").notNull(),
  body: text("body", { mode: "json" }).$type<MethodologyBody>().notNull(),
  originChunkIds: text("originChunkIds", { mode: "json" }).$type<string[]>().notNull(),
  createdBy: text("createdBy").$type<MethodologyCreatedBy>().notNull(),
  mergedIntoId: text("mergedIntoId"),
  version: integer("version").default(1).notNull(),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
  confirmedAt: integer("confirmedAt"),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const methodologyTags = sqliteTable(
  "methodology_tags",
  {
    methodologyId: text("methodologyId")
      .notNull()
      .references(() => methodologies.id, { onDelete: "cascade" }),
    tagId: text("tagId")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.methodologyId, table.tagId] })],
);

export const mergeSuggestions = sqliteTable("merge_suggestions", {
  id: text("id").primaryKey(),
  sourceId: text("sourceId")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  methodologyIds: text("methodologyIds", { mode: "json" }).$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<MergeSuggestionStatus>().notNull(),
  createdAt: integer("createdAt").notNull(),
});

export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  targetMethodologyId: text("targetMethodologyId")
    .notNull()
    .references(() => methodologies.id),
  targetVersion: integer("targetVersion").notNull(),
  difficulty: text("difficulty").$type<Difficulty>().notNull(),
  scope: text("scope", { mode: "json" }).$type<Scope>().notNull(),
  candidateIds: text("candidateIds", { mode: "json" }).$type<string[]>().notNull(),
  title: text("title").notNull(),
  background: text("background").notNull(),
  userRole: text("userRole").notNull(),
  userGoal: text("userGoal").notNull(),
  counterpartName: text("counterpartName").notNull(),
  counterpartRelation: text("counterpartRelation").notNull(),
  counterpartProfile: text("counterpartProfile").notNull(),
  openingSpeaker: text("openingSpeaker").$type<"counterpart" | "user">().notNull(),
  openingLine: text("openingLine"),
  brief: text("brief", { mode: "json" }).$type<CounterpartBrief>().notNull(),
  alternatives: text("alternatives", { mode: "json" }).$type<Alternative[]>().notNull(),
  designNotes: text("designNotes").notNull(),
  promptVersion: text("promptVersion").notNull(),
  createdAt: integer("createdAt").notNull(),
});

export const practiceSessions = sqliteTable("practice_sessions", {
  id: text("id").primaryKey(),
  scenarioId: text("scenarioId")
    .notNull()
    .references(() => scenarios.id),
  mode: text("mode").$type<PracticeMode>().notNull(),
  status: text("status").$type<SessionStatus>().notNull(),
  selectedMethodologyId: text("selectedMethodologyId"),
  targetSnapshot: text("targetSnapshot", { mode: "json" }).$type<MethodologySnapshot>(),
  selectedSnapshot: text("selectedSnapshot", { mode: "json" }).$type<MethodologySnapshot>(),
  hintUsed: integer("hintUsed", { mode: "boolean" }).default(false).notNull(),
  maxTurns: integer("maxTurns").notNull(),
  endReason: text("endReason").$type<EndReason>(),
  endNote: text("endNote"),
  createdAt: integer("createdAt").notNull(),
  startedAt: integer("startedAt"),
  endedAt: integer("endedAt"),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").$type<MessageRole>().notNull(),
    turn: integer("turn").notNull(),
    content: text("content").notNull(),
    meta: text("meta", { mode: "json" }).$type<MessageMeta>(),
    createdAt: integer("createdAt").notNull(),
  },
  (table) => [unique("messages_session_seq_unique").on(table.sessionId, table.seq)],
);

export const debriefs = sqliteTable("debriefs", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId")
    .notNull()
    .unique()
    .references(() => practiceSessions.id, { onDelete: "cascade" }),
  recognition: text("recognition").$type<Recognition>(),
  recognitionExplanation: text("recognitionExplanation"),
  executionScore: integer("executionScore").notNull(),
  scoreBreakdown: text("scoreBreakdown", { mode: "json" }).$type<ScoreBreakdown>().notNull(),
  holisticScore: integer("holisticScore").notNull(),
  holisticComment: text("holisticComment").notNull(),
  outcome: text("outcome").$type<Outcome>().notNull(),
  outcomeNote: text("outcomeNote").notNull(),
  summary: text("summary", { mode: "json" }).$type<DebriefSummary>().notNull(),
  promptVersion: text("promptVersion").notNull(),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
});

export const verdicts = sqliteTable("verdicts", {
  id: text("id").primaryKey(),
  debriefId: text("debriefId")
    .notNull()
    .references(() => debriefs.id, { onDelete: "cascade" }),
  kind: text("kind").$type<VerdictKind>().notNull(),
  stepId: text("stepId"),
  refId: text("refId").notNull(),
  aiVerdict: text("aiVerdict").$type<KeyPointVerdictValue | PrincipleVerdictValue>().notNull(),
  aiQuality: integer("aiQuality"),
  verdict: text("verdict").$type<KeyPointVerdictValue | PrincipleVerdictValue>().notNull(),
  quality: integer("quality"),
  evidenceDowngraded: integer("evidenceDowngraded", { mode: "boolean" })
    .default(false)
    .notNull(),
  comment: text("comment").notNull(),
  suggestion: text("suggestion"),
  evidence: text("evidence", { mode: "json" }).$type<Evidence[]>().notNull(),
  rewrite: text("rewrite", { mode: "json" }).$type<ModelRewrite>(),
  overrideVerdict: text("overrideVerdict").$type<
    KeyPointVerdictValue | PrincipleVerdictValue
  >(),
  overrideQuality: integer("overrideQuality"),
  overrideReason: text("overrideReason"),
  overriddenAt: integer("overriddenAt"),
});

export const llmCalls = sqliteTable("llm_calls", {
  id: text("id").primaryKey(),
  task: text("task").$type<LLMTaskName>().notNull(),
  refType: text("refType"),
  refId: text("refId"),
  model: text("model").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").$type<LLMCallStatus>().notNull(),
  durationMs: integer("durationMs").notNull(),
  promptTokens: integer("promptTokens"),
  completionTokens: integer("completionTokens"),
  requestMessages: text("requestMessages").notNull(),
  responseText: text("responseText"),
  error: text("error"),
  createdAt: integer("createdAt").notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Methodology = typeof methodologies.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type MethodologyTag = typeof methodologyTags.$inferSelect;
export type MergeSuggestion = typeof mergeSuggestions.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type PracticeSession = typeof practiceSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Debrief = typeof debriefs.$inferSelect;
export type Verdict = typeof verdicts.$inferSelect;
export type LLMCall = typeof llmCalls.$inferSelect;
