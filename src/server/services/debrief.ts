import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { checkEvidence, downgradeKeyPoint, downgradePrinciple } from "@/domain/evidence";
import { computeRecognition } from "@/domain/recognition";
import type {
  Evidence,
  KeyPointVerdictValue,
  MethodologySnapshot,
  PrincipleVerdictValue,
  ScoreBreakdown,
} from "@/domain/schemas";
import {
  computeExecutionScore,
  convergeKeyPoint,
  validateKeyPointOverride,
  type EffectiveKeyPoint,
} from "@/domain/scoring";
import { db, type AppDatabase } from "@/server/db/client";
import {
  debriefs,
  messages,
  methodologies,
  practiceSessions,
  scenarios,
  verdicts,
  type Verdict,
} from "@/server/db/schema";
import {
  toDebriefDto,
  toVerdictDto,
  type DebriefDto,
  type OverrideInput,
  type OverrideResultDto,
} from "@/server/dto/debrief";
import { ApiError } from "@/server/http";
import { runTask, type TaskContext } from "@/server/llm/run-task";
import {
  buildDebriefRefs,
  buildSelectedInput,
  buildTranscript,
  debriefTask,
  toDebriefScenarioBrief,
  type DebriefInput,
  type DebriefOutput,
} from "@/server/prompts/debrief";

import { getSession } from "./practice";

/** 复盘：组装输入 → AI 判定 → 证据核对与降级 → 识别与执行分（代码）→ 落库；改判后重算（api-and-ui.md §2.3）。 */

type SessionRow = typeof practiceSessions.$inferSelect;
type ScenarioRow = typeof scenarios.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

/** 复盘任务的入口；默认走 runTask，测试可替换为桩。 */
export type DebriefFn = (input: DebriefInput, ctx: TaskContext) => Promise<DebriefOutput>;

export interface DebriefOptions {
  database?: AppDatabase;
  signal?: AbortSignal;
  debrief?: DebriefFn;
}

const runDebrief: DebriefFn = (input, ctx) => runTask(debriefTask, input, ctx);

function loadSession(database: AppDatabase, id: string): SessionRow {
  const row = database.select().from(practiceSessions).where(eq(practiceSessions.id, id)).get();
  if (!row) throw new ApiError(404, "not_found", "练习不存在");
  return row;
}

function requireSnapshots(session: SessionRow): { selected: MethodologySnapshot; target: MethodologySnapshot } {
  if (!session.selectedSnapshot || !session.targetSnapshot) {
    throw new ApiError(409, "invalid_state", "练习尚未开始，没有可复盘的内容");
  }
  return { selected: session.selectedSnapshot, target: session.targetSnapshot };
}

// ───────────── 组装输入 ─────────────

function buildInput(
  database: AppDatabase,
  session: SessionRow,
  scenario: ScenarioRow,
  rows: MessageRow[],
  snapshots: { selected: MethodologySnapshot; target: MethodologySnapshot },
): DebriefInput {
  const { selected, target } = snapshots;

  // 阻力触发记录：linkedStepId 指向目标方法论的步骤
  const fired = new Map<string, number[]>();
  for (const m of rows) {
    if (m.role !== "counterpart") continue;
    for (const id of m.meta?.firedResistanceIds ?? []) {
      fired.set(id, [...(fired.get(id) ?? []), m.turn]);
    }
  }
  const targetStepTitles = new Map(target.body.steps.map((s) => [s.id, s.title]));
  const firedResistance = scenario.brief.plannedResistance.flatMap((r) => {
    const turns = fired.get(r.id);
    if (!turns) return [];
    return [
      {
        id: r.id,
        trigger: r.trigger,
        linkedStepTitle: r.linkedStepId ? (targetStepTitles.get(r.linkedStepId) ?? null) : null,
        turns: [...new Set(turns)],
      },
    ];
  });

  let recognition: DebriefInput["recognition"];
  if (session.mode === "quiz") {
    const alternativeIds = scenario.alternatives.map((a) => a.methodologyId);
    const names = new Map(
      database
        .select({ id: methodologies.id, name: methodologies.name })
        .from(methodologies)
        .where(inArray(methodologies.id, alternativeIds))
        .all()
        .map((r) => [r.id, r.name]),
    );
    recognition = {
      result: computeRecognition({
        selectedId: selected.methodologyId,
        targetId: target.methodologyId,
        alternativeIds,
      }).recognition,
      selectedName: selected.name,
      selectedApplicability: selected.body.applicability.map((a) => a.text),
      selectedCounterIndications: selected.body.counterIndications.map((a) => a.text),
      targetName: target.name,
      targetApplicability: target.body.applicability.map((a) => a.text),
      alternativeNames: alternativeIds.flatMap((id) => names.get(id) ?? []),
    };
  }

  return {
    mode: session.mode,
    scenario: {
      title: scenario.title,
      background: scenario.background,
      userRole: scenario.userRole,
      userGoal: scenario.userGoal,
      counterpart: {
        name: scenario.counterpartName,
        relation: scenario.counterpartRelation,
        profile: scenario.counterpartProfile,
      },
      openingLine: scenario.openingLine,
      brief: toDebriefScenarioBrief(scenario.brief),
      designNotes: scenario.designNotes,
    },
    selected: buildSelectedInput(selected),
    ...(recognition ? { recognition } : {}),
    transcript: buildTranscript(rows),
    firedResistance,
    userTurnCount: rows.filter((m) => m.role === "user").length,
  };
}

// ───────────── 评分 ─────────────

function effectiveScore(snapshot: MethodologySnapshot, rows: Verdict[]): ScoreBreakdown {
  const keyPoints: Record<string, EffectiveKeyPoint> = {};
  const principles: Record<string, PrincipleVerdictValue> = {};
  for (const row of rows) {
    const verdict = row.overrideVerdict ?? row.verdict;
    if (row.kind === "key_point") {
      keyPoints[row.refId] = {
        verdict: verdict as KeyPointVerdictValue,
        quality: row.overrideVerdict !== null ? row.overrideQuality : row.quality,
        evidence: row.evidence,
      };
    } else {
      principles[row.refId] = verdict as PrincipleVerdictValue;
    }
  }
  return computeExecutionScore({ body: snapshot.body, keyPoints, principles });
}

// ───────────── 生成复盘 ─────────────

const inFlight = new Map<string, Promise<DebriefDto>>();

/** 同一场练习同时只跑一次复盘（页面重复触发时复用同一次调用）。 */
export function generateDebrief(sessionId: string, options: DebriefOptions = {}): Promise<DebriefDto> {
  const running = inFlight.get(sessionId);
  if (running) return running;
  const promise = doGenerate(sessionId, options).finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, promise);
  return promise;
}

async function doGenerate(sessionId: string, options: DebriefOptions): Promise<DebriefDto> {
  const database = options.database ?? db;
  const session = loadSession(database, sessionId);
  if (session.status === "debriefed") throw new ApiError(409, "invalid_state", "这场练习已经复盘过了");
  if (session.status !== "ended" && session.status !== "debrief_failed") {
    throw new ApiError(409, "invalid_state", "练习还没有结束，不能复盘");
  }
  const snapshots = requireSnapshots(session);
  const scenario = database.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get() as ScenarioRow;
  const rows = database
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))
    .all();

  try {
    const input = buildInput(database, session, scenario, rows, snapshots);
    const output = await (options.debrief ?? runDebrief)(input, {
      refType: "session",
      refId: sessionId,
      signal: options.signal,
    });
    save(database, session, snapshots, rows, output);
  } catch (err) {
    database
      .update(practiceSessions)
      .set({ status: "debrief_failed" })
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          inArray(practiceSessions.status, ["ended", "debrief_failed"]),
        ),
      )
      .run();
    throw err;
  }
  return getDebrief(sessionId, database);
}

/** AI 输出 → 质量分收敛 → 证据核对与降级 → 识别 → 执行分 → 同一事务写入。 */
function save(
  database: AppDatabase,
  session: SessionRow,
  snapshots: { selected: MethodologySnapshot; target: MethodologySnapshot },
  rows: MessageRow[],
  output: DebriefOutput,
): void {
  const { selected, target } = snapshots;
  const refs = buildDebriefRefs(selected.body);
  const stepById = new Map(selected.body.steps.map((s) => [s.id, s]));
  const userMessages = rows.filter((m) => m.role === "user").map((m) => ({ turn: m.turn, content: m.content }));
  const debriefId = nanoid();

  const verdictRows: Verdict[] = [];
  for (const v of output.keyPointVerdicts) {
    const node = refs.keyPoints.get(v.ref);
    if (!node) continue;
    const step = stepById.get(node.stepId)!;
    const converged = convergeKeyPoint(v.verdict, v.quality, step.conditional);
    const evidence: Evidence[] = checkEvidence(v.evidence, userMessages);
    const final = downgradeKeyPoint(converged.verdict, converged.quality, evidence);
    verdictRows.push({
      id: nanoid(),
      debriefId,
      kind: "key_point",
      stepId: node.stepId,
      refId: node.keyPointId,
      aiVerdict: converged.verdict,
      aiQuality: converged.quality,
      verdict: final.verdict,
      quality: final.quality,
      evidenceDowngraded: final.downgraded,
      comment: v.comment,
      suggestion: v.suggestion,
      evidence,
      rewrite:
        v.rewrite && (final.verdict === "partial" || final.verdict === "missed")
          ? {
              turn: v.rewrite.turn,
              original: v.rewrite.original,
              rewrite: v.rewrite.rewrite,
              conceptIds: v.rewrite.conceptRefs.flatMap((ref) => refs.concepts.get(ref) ?? []),
            }
          : null,
      overrideVerdict: null,
      overrideQuality: null,
      overrideReason: null,
      overriddenAt: null,
    });
  }
  for (const v of output.principleVerdicts) {
    const principleId = refs.principles.get(v.ref);
    if (!principleId) continue;
    const evidence = checkEvidence(v.evidence, userMessages);
    const final = downgradePrinciple(v.verdict, evidence);
    verdictRows.push({
      id: nanoid(),
      debriefId,
      kind: "principle",
      stepId: null,
      refId: principleId,
      aiVerdict: v.verdict,
      aiQuality: null,
      verdict: final.verdict,
      quality: null,
      evidenceDowngraded: final.downgraded,
      comment: v.comment,
      suggestion: null,
      evidence,
      rewrite: null,
      overrideVerdict: null,
      overrideQuality: null,
      overrideReason: null,
      overriddenAt: null,
    });
  }

  const breakdown = effectiveScore(selected, verdictRows);
  const recognition =
    session.mode === "quiz"
      ? computeRecognition({
          selectedId: selected.methodologyId,
          targetId: target.methodologyId,
          alternativeIds: (
            database
              .select({ alternatives: scenarios.alternatives })
              .from(scenarios)
              .where(eq(scenarios.id, session.scenarioId))
              .get()?.alternatives ?? []
          ).map((a) => a.methodologyId),
        }).recognition
      : null;
  const now = Date.now();

  database.transaction((tx) => {
    const current = loadSession(tx, session.id);
    if (current.status !== "ended" && current.status !== "debrief_failed") {
      throw new ApiError(409, "invalid_state", "练习状态已变化，无法保存复盘");
    }
    tx.delete(debriefs).where(eq(debriefs.sessionId, session.id)).run();
    tx.insert(debriefs)
      .values({
        id: debriefId,
        sessionId: session.id,
        recognition,
        recognitionExplanation: recognition ? output.recognitionExplanation : null,
        executionScore: breakdown.executionScore,
        scoreBreakdown: breakdown,
        holisticScore: output.holistic.score,
        holisticComment: output.holistic.comment,
        outcome: output.outcome.result,
        outcomeNote: output.outcome.note,
        summary: output.summary,
        promptVersion: debriefTask.promptVersion,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (verdictRows.length > 0) tx.insert(verdicts).values(verdictRows).run();
    tx.update(practiceSessions).set({ status: "debriefed" }).where(eq(practiceSessions.id, session.id)).run();
  });
}

// ───────────── 读取 ─────────────

export function getDebrief(sessionId: string, database: AppDatabase = db): DebriefDto {
  const session = loadSession(database, sessionId);
  const debrief = database.select().from(debriefs).where(eq(debriefs.sessionId, sessionId)).get();
  if (!debrief || session.status !== "debriefed") {
    throw new ApiError(404, "not_found", "这场练习还没有复盘");
  }
  const snapshots = requireSnapshots(session);
  const scenario = database.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).get() as ScenarioRow;
  return toDebriefDto({
    debrief,
    verdicts: database.select().from(verdicts).where(eq(verdicts.debriefId, debrief.id)).all(),
    selected: snapshots.selected,
    target: snapshots.target,
    session: getSession(sessionId, database),
    mode: session.mode,
    difficulty: scenario.difficulty,
    hintUsed: session.hintUsed,
  });
}

// ───────────── 改判 ─────────────

function loadVerdictContext(database: AppDatabase, verdictId: string) {
  const verdict = database.select().from(verdicts).where(eq(verdicts.id, verdictId)).get();
  if (!verdict) throw new ApiError(404, "not_found", "判定不存在");
  const debrief = database.select().from(debriefs).where(eq(debriefs.id, verdict.debriefId)).get();
  if (!debrief) throw new ApiError(404, "not_found", "复盘不存在");
  const session = loadSession(database, debrief.sessionId);
  const snapshot = requireSnapshots(session).selected;
  return { verdict, debrief, snapshot };
}

function textOf(snapshot: MethodologySnapshot, verdict: Verdict): string {
  const { body } = snapshot;
  if (verdict.kind === "principle") return body.principles.find((p) => p.id === verdict.refId)?.text ?? "";
  return body.steps.flatMap((s) => s.keyPoints).find((k) => k.id === verdict.refId)?.text ?? "";
}

/** 改判 / 撤销改判后：重算执行分与明细并返回。 */
function applyAndRecompute(
  database: AppDatabase,
  verdictId: string,
  change: Partial<Pick<Verdict, "overrideVerdict" | "overrideQuality" | "overrideReason" | "overriddenAt">>,
): OverrideResultDto {
  return database.transaction((tx) => {
    const { verdict, debrief, snapshot } = loadVerdictContext(tx, verdictId);
    tx.update(verdicts).set(change).where(eq(verdicts.id, verdictId)).run();
    const rows = tx.select().from(verdicts).where(eq(verdicts.debriefId, debrief.id)).all();
    const breakdown = effectiveScore(snapshot, rows);
    tx.update(debriefs)
      .set({ executionScore: breakdown.executionScore, scoreBreakdown: breakdown, updatedAt: Date.now() })
      .where(eq(debriefs.id, debrief.id))
      .run();
    const updated = rows.find((r) => r.id === verdictId)!;
    return {
      verdict: toVerdictDto(updated, textOf(snapshot, verdict)),
      executionScore: breakdown.executionScore,
      scoreBreakdown: breakdown,
    };
  });
}

export function overrideVerdict(
  verdictId: string,
  input: OverrideInput,
  database: AppDatabase = db,
): OverrideResultDto {
  const { verdict, snapshot } = loadVerdictContext(database, verdictId);

  if (verdict.kind === "key_point") {
    const parsed = (["done", "partial", "missed", "not_triggered"] as const).find((v) => v === input.verdict);
    if (!parsed) throw new ApiError(400, "invalid_input", "要点的判定只能是：做到、部分做到、未做到、未触发");
    const step = snapshot.body.steps.find((s) => s.id === verdict.stepId);
    const problem = validateKeyPointOverride(parsed, input.quality, step?.conditional ?? false);
    if (problem) throw new ApiError(400, "invalid_input", problem);
  } else {
    if (input.verdict !== "kept" && input.verdict !== "violated") {
      throw new ApiError(400, "invalid_input", "原则的判定只能是：遵守、违反");
    }
    if (input.quality !== null) throw new ApiError(400, "invalid_input", "原则判定不需要质量分");
  }

  return applyAndRecompute(database, verdictId, {
    overrideVerdict: input.verdict,
    overrideQuality: input.quality,
    overrideReason: input.reason,
    overriddenAt: Date.now(),
  });
}

export function clearOverride(verdictId: string, database: AppDatabase = db): OverrideResultDto {
  const { verdict } = loadVerdictContext(database, verdictId);
  if (verdict.overrideVerdict === null) throw new ApiError(409, "invalid_state", "这条判定没有被改判");
  return applyAndRecompute(database, verdictId, {
    overrideVerdict: null,
    overrideQuality: null,
    overrideReason: null,
    overriddenAt: null,
  });
}
