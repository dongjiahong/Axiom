import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { validateMethodologyForConfirm } from "@/domain/methodology-validate";
import { MethodologyBody } from "@/domain/schemas";
import { db, type AppDatabase } from "@/server/db/client";
import {
  mergeSuggestions,
  methodologies,
  methodologyTags,
  sourceChunks,
  sources,
  type MergeSuggestionStatus,
  type MethodologyStatus,
} from "@/server/db/schema";
import { countBodyMarks } from "@/server/dto/extraction";
import type {
  MethodologyBodyInput,
  MethodologyDetailDto,
  MethodologyListItemDto,
  SaveMethodologyInput,
} from "@/server/dto/methodology";
import { insertDraft, tagNamesByMethodology } from "@/server/extraction/drafts";
import { mergeDrafts, runMergeTask, type MergeFn } from "@/server/extraction/merge-drafts";
import { ApiError, type ApiIssue } from "@/server/http";
import { describeIssue, formatIssuePath } from "@/server/prompts/common";

import { setMethodologyTags } from "./tags";

/** 方法论库：列表、编辑保存、状态迁移、拆分、合并（api-and-ui.md §2.2）。 */

export interface MethodologyServiceOptions {
  database?: AppDatabase;
  /** 仅测试注入：默认走 runTask(mergeTask)。 */
  merge?: MergeFn;
}

type MethodologyRow = typeof methodologies.$inferSelect;

export interface MethodologyFilter {
  status?: MethodologyStatus;
  tagId?: string;
  sourceId?: string;
  q?: string;
}

// ───────────── 读取 ─────────────

function getRow(database: AppDatabase, id: string): MethodologyRow {
  const row = database.select().from(methodologies).where(eq(methodologies.id, id)).get();
  if (!row) throw new ApiError(404, "not_found", "方法论不存在");
  return row;
}

function sourceTitles(database: AppDatabase, ids: (string | null)[]): Map<string, string> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  return new Map(
    database
      .select({ id: sources.id, title: sources.title })
      .from(sources)
      .where(inArray(sources.id, wanted))
      .all()
      .map((row) => [row.id, row.title]),
  );
}

export function listMethodologies(
  filter: MethodologyFilter = {},
  database: AppDatabase = db,
): MethodologyListItemDto[] {
  const conditions = [];
  if (filter.status) conditions.push(eq(methodologies.status, filter.status));
  if (filter.sourceId) conditions.push(eq(methodologies.sourceId, filter.sourceId));
  const q = filter.q?.trim().toLowerCase();
  if (q) conditions.push(sql`instr(lower(${methodologies.name}), ${q}) > 0`);
  if (filter.tagId) {
    conditions.push(
      exists(
        database
          .select({ one: sql`1` })
          .from(methodologyTags)
          .where(
            and(
              eq(methodologyTags.methodologyId, methodologies.id),
              eq(methodologyTags.tagId, filter.tagId),
            ),
          ),
      ),
    );
  }

  const rows = database
    .select()
    .from(methodologies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(methodologies.updatedAt), sql`rowid desc`)
    .all();
  const tagMap = tagNamesByMethodology(
    database,
    rows.map((row) => row.id),
  );
  const titles = sourceTitles(
    database,
    rows.map((row) => row.sourceId),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    createdBy: row.createdBy,
    tags: tagMap.get(row.id) ?? [],
    sourceId: row.sourceId,
    sourceTitle: row.sourceId ? (titles.get(row.sourceId) ?? null) : null,
    stepCount: row.body.steps.length,
    ...countBodyMarks(row.body),
    version: row.version,
    updatedAt: row.updatedAt,
  }));
}

function toDetail(database: AppDatabase, row: MethodologyRow): MethodologyDetailDto {
  const chunks =
    row.originChunkIds.length === 0
      ? []
      : database
          .select({ id: sourceChunks.id, sourceId: sourceChunks.sourceId, title: sourceChunks.title })
          .from(sourceChunks)
          .where(inArray(sourceChunks.id, row.originChunkIds))
          .orderBy(sourceChunks.sourceId, sourceChunks.seq)
          .all();
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdBy: row.createdBy,
    tags: tagNamesByMethodology(database, [row.id]).get(row.id) ?? [],
    sourceId: row.sourceId,
    sourceTitle: row.sourceId ? (sourceTitles(database, [row.sourceId]).get(row.sourceId) ?? null) : null,
    body: row.body,
    originChunks: chunks,
    mergedIntoId: row.mergedIntoId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    confirmedAt: row.confirmedAt,
  };
}

export function getMethodology(id: string, database: AppDatabase = db): MethodologyDetailDto {
  return toDetail(database, getRow(database, id));
}

// ───────────── 新建与保存 ─────────────

/** 手动新建：一个空白 draft，带 1 个空步骤骨架（1 个空要点）。 */
export function createBlankMethodology(database: AppDatabase = db): MethodologyDetailDto {
  const node = () => ({ id: nanoid(), excerpt: null, inferred: false });
  const body: MethodologyBody = {
    summary: "",
    goal: "",
    applicability: [],
    counterIndications: [],
    orderMode: "loose",
    steps: [
      {
        ...node(),
        title: "",
        description: "",
        conditional: false,
        trigger: null,
        keyPoints: [{ ...node(), text: "" }],
        exampleLines: [],
        commonMistakes: [],
      },
    ],
    principles: [],
    concepts: [],
  };
  const id = database.transaction((tx) =>
    insertDraft(tx, {
      sourceId: null,
      name: "新方法论",
      body,
      originChunkIds: [],
      createdBy: "manual",
      tagNames: [],
    }),
  );
  return getMethodology(id, database);
}

/** 给缺 id（或 id 重复）的节点补上 nanoid；概念关联的步骤 id 只保留仍存在的。 */
function fillIds(input: MethodologyBodyInput): MethodologyBody {
  const seen = new Set<string>();
  const assign = <T extends { id?: string }>(node: T): T & { id: string } => {
    const id = node.id && !seen.has(node.id) ? node.id : nanoid();
    seen.add(id);
    return { ...node, id };
  };
  const steps = input.steps.map((step) => ({
    ...assign(step),
    keyPoints: step.keyPoints.map(assign),
  }));
  const stepIds = new Set(steps.map((step) => step.id));
  return {
    ...input,
    applicability: input.applicability.map(assign),
    counterIndications: input.counterIndications.map(assign),
    steps,
    principles: input.principles.map(assign),
    concepts: input.concepts.map((concept) => ({
      ...assign(concept),
      relatedStepIds: concept.relatedStepIds.filter((id) => stepIds.has(id)),
    })),
  };
}

/**
 * 确认入库前的全部问题：validateMethodologyForConfirm 的业务规则，
 * 加上 MethodologyBody 严格校验（如步骤标题、要点文本不能为空）；同一路径只报一次。
 */
export function collectConfirmIssues(name: string, body: MethodologyBody): ApiIssue[] {
  const issues: ApiIssue[] = validateMethodologyForConfirm({ name, body });
  const parsed = MethodologyBody.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = formatIssuePath(issue.path);
      if (issues.some((existing) => existing.path === path)) continue;
      issues.push({ path, message: `${path}：${describeIssue(issue)}` });
    }
  }
  return issues;
}

function assertConfirmable(name: string, body: MethodologyBody, action: string): void {
  const issues = collectConfirmIssues(name, body);
  if (issues.length === 0) return;
  throw new ApiError(
    400,
    "invalid_input",
    `无法${action}，请先修正 ${issues.length} 个问题：${issues.map((issue) => issue.message).join("；")}`,
    issues,
  );
}

/** 保存编辑（draft 或 confirmed）；confirmed 保存前须通过确认校验，保存后 version+1。 */
export function saveMethodology(
  id: string,
  input: SaveMethodologyInput,
  options: MethodologyServiceOptions = {},
): MethodologyDetailDto {
  const database = options.database ?? db;
  const row = getRow(database, id);
  if (row.status === "archived") {
    throw new ApiError(409, "invalid_state", "已归档的方法论不能编辑，请先恢复");
  }
  const name = input.name.trim();
  const body = fillIds(input.body);
  if (row.status === "confirmed") assertConfirmable(name, body, "保存已确认的方法论");

  database.transaction((tx) => {
    tx.update(methodologies)
      .set({
        name,
        body,
        version: row.status === "confirmed" ? row.version + 1 : row.version,
        updatedAt: Date.now(),
      })
      .where(eq(methodologies.id, id))
      .run();
    setMethodologyTags(tx, id, input.tags);
  });
  return getMethodology(id, database);
}

// ───────────── 状态迁移 ─────────────

export type StatusAction = "confirm" | "unconfirm" | "archive" | "restore";

const TRANSITIONS: Record<StatusAction, { from: MethodologyStatus[]; to: MethodologyStatus; error: string }> = {
  confirm: { from: ["draft"], to: "confirmed", error: "只有候选方法论可以确认入库" },
  unconfirm: { from: ["confirmed"], to: "draft", error: "只有已确认的方法论可以退回候选" },
  archive: { from: ["draft", "confirmed"], to: "archived", error: "只有候选或已确认的方法论可以归档" },
  restore: { from: ["archived"], to: "draft", error: "只有已归档的方法论可以恢复" },
};

export function changeMethodologyStatus(
  id: string,
  action: StatusAction,
  database: AppDatabase = db,
): MethodologyDetailDto {
  const row = getRow(database, id);
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(row.status)) throw new ApiError(409, "invalid_state", rule.error);
  if (action === "confirm") assertConfirmable(row.name, row.body, "确认入库");

  const now = Date.now();
  database.transaction((tx) => {
    tx.update(methodologies)
      .set({
        status: rule.to,
        updatedAt: now,
        confirmedAt: action === "confirm" ? now : null,
        ...(action === "restore" ? { mergedIntoId: null } : {}),
      })
      .where(eq(methodologies.id, id))
      .run();

    // 撤销合并：恢复原 draft 时，把仍是 draft 的合并结果归档；已确认的合并结果不动。
    if (action === "restore" && row.mergedIntoId) {
      tx.update(methodologies)
        .set({ status: "archived", updatedAt: now })
        .where(and(eq(methodologies.id, row.mergedIntoId), eq(methodologies.status, "draft")))
        .run();
    }
  });
  return getMethodology(id, database);
}

// ───────────── 拆分 ─────────────

/** 选中步骤 → 新 draft（名称加"（拆分）"，复制适用条件、反例、原则、概念）；原方法论移除这些步骤。 */
export function splitMethodology(
  id: string,
  stepIds: string[],
  database: AppDatabase = db,
): MethodologyDetailDto {
  const row = getRow(database, id);
  if (row.status !== "draft") {
    throw new ApiError(409, "invalid_state", "只有候选方法论可以拆分");
  }
  const selected = new Set(stepIds);
  const known = new Set(row.body.steps.map((step) => step.id));
  const unknown = [...selected].filter((stepId) => !known.has(stepId));
  if (selected.size === 0 || unknown.length > 0) {
    throw new ApiError(400, "invalid_input", "请选择要拆出的步骤（所选步骤不存在或为空）");
  }

  const moved = row.body.steps.filter((step) => selected.has(step.id));
  const kept = row.body.steps.filter((step) => !selected.has(step.id));
  if (!kept.some((step) => !step.conditional)) {
    throw new ApiError(400, "invalid_input", "拆分后原方法论至少要保留 1 个非条件步骤");
  }

  const newId = database.transaction((tx) => {
    const tagNames = tagNamesByMethodology(tx, [id]).get(id) ?? [];
    const created = insertDraft(tx, {
      sourceId: row.sourceId,
      name: `${row.name}（拆分）`,
      body: cloneForSplit(row.body, moved.map((step) => step.id)),
      originChunkIds: row.originChunkIds,
      createdBy: "split",
      tagNames,
    });
    tx.update(methodologies)
      .set({
        body: {
          ...row.body,
          steps: kept,
          concepts: row.body.concepts.map((concept) => ({
            ...concept,
            relatedStepIds: concept.relatedStepIds.filter((stepId) => !selected.has(stepId)),
          })),
        },
        updatedAt: Date.now(),
      })
      .where(eq(methodologies.id, id))
      .run();
    return created;
  });
  return getMethodology(newId, database);
}

/** 复制正文并给所有节点换新 id，只保留 stepIds 对应的步骤（概念的关联步骤随之映射）。 */
function cloneForSplit(body: MethodologyBody, stepIds: string[]): MethodologyBody {
  const fresh = <T extends { id: string }>(node: T): T => ({ ...node, id: nanoid() });
  const idMap = new Map<string, string>();
  const steps = body.steps
    .filter((step) => stepIds.includes(step.id))
    .map((step) => {
      const copy = fresh(step);
      idMap.set(step.id, copy.id);
      return { ...copy, keyPoints: step.keyPoints.map(fresh) };
    });
  return {
    ...body,
    applicability: body.applicability.map(fresh),
    counterIndications: body.counterIndications.map(fresh),
    steps,
    principles: body.principles.map(fresh),
    concepts: body.concepts.map((concept) => ({
      ...fresh(concept),
      relatedStepIds: concept.relatedStepIds.flatMap((stepId) => idMap.get(stepId) ?? []),
    })),
  };
}

// ───────────── 合并 ─────────────

function loadDrafts(database: AppDatabase, ids: string[], missing: ApiError): MethodologyRow[] {
  const rows = database.select().from(methodologies).where(inArray(methodologies.id, ids)).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw missing;
    if (row.status !== "draft") {
      throw new ApiError(409, "invalid_state", `「${row.name}」不是候选方法论，无法合并`);
    }
    return row;
  });
}

async function mergeIds(
  ids: string[],
  missing: ApiError,
  options: MethodologyServiceOptions,
): Promise<MethodologyDetailDto> {
  const database = options.database ?? db;
  const members = loadDrafts(database, ids, missing);
  const newId = await mergeDrafts(database, members, options.merge ?? runMergeTask, {
    refType: "methodology",
    refId: ids[0],
    db: database,
  });
  return getMethodology(newId, database);
}

/** 手动合并 ≥2 个 draft：runTask(merge) → 新 draft，原 draft 归档。 */
export async function mergeMethodologies(
  ids: string[],
  options: MethodologyServiceOptions = {},
): Promise<MethodologyDetailDto> {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new ApiError(400, "invalid_input", "至少需要选择 2 个不同的候选方法论");
  return mergeIds(unique, new ApiError(404, "not_found", "要合并的方法论不存在"), options);
}

// ───────────── 合并建议 ─────────────

function getOpenSuggestion(database: AppDatabase, id: string) {
  const row = database.select().from(mergeSuggestions).where(eq(mergeSuggestions.id, id)).get();
  if (!row) throw new ApiError(404, "not_found", "合并建议不存在");
  if (row.status !== "open") throw new ApiError(409, "invalid_state", "这条合并建议已经处理过了");
  return row;
}

function setSuggestionStatus(database: AppDatabase, id: string, status: MergeSuggestionStatus) {
  database.update(mergeSuggestions).set({ status }).where(eq(mergeSuggestions.id, id)).run();
}

/** 接受合并建议：执行合并；任一成员已不是 draft 则 409。 */
export async function acceptMergeSuggestion(
  id: string,
  options: MethodologyServiceOptions = {},
): Promise<MethodologyDetailDto> {
  const database = options.database ?? db;
  const suggestion = getOpenSuggestion(database, id);
  const merged = await mergeIds(
    suggestion.methodologyIds,
    new ApiError(409, "invalid_state", "建议中的方法论已被删除，无法合并"),
    options,
  );
  setSuggestionStatus(database, id, "accepted");
  return merged;
}

export function dismissMergeSuggestion(id: string, database: AppDatabase = db): { dismissed: true } {
  getOpenSuggestion(database, id);
  setSuggestionStatus(database, id, "dismissed");
  return { dismissed: true };
}
