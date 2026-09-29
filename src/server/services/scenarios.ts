import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { QUIZ_MIN_SCOPE_SIZE, SCENARIO_RECENT_TITLES } from "@/domain/constants";
import { computeMastery, type MasteryRecord } from "@/domain/mastery";
import type { MethodologyBody } from "@/domain/schemas";
import { pickWeighted, resolveScope } from "@/domain/selection";
import { db, type AppDatabase } from "@/server/db/client";
import {
  debriefs,
  methodologies,
  methodologyTags,
  practiceSessions,
  scenarios,
} from "@/server/db/schema";
import type { CreatePracticeInput } from "@/server/dto/session";
import { ApiError } from "@/server/http";
import { runTask } from "@/server/llm/run-task";
import {
  buildScenarioInput,
  scenarioTask,
  stepRef,
  methodologyRef,
} from "@/server/prompts/scenario";

/** 选题与场景生成。 */

export interface ScenarioServiceOptions {
  database?: AppDatabase;
  signal?: AbortSignal;
  /** 仅测试注入：加权随机的随机源。 */
  rng?: () => number;
  /** 仅测试注入：计算掌握度所用的当前时间。 */
  now?: number;
}

export interface ConfirmedMethodology {
  id: string;
  name: string;
  version: number;
  sourceId: string | null;
  tagIds: string[];
  body: MethodologyBody;
}

/** 方法论库：全部已确认方法论（含标签 ID，供范围解析）。 */
export function loadConfirmedMethodologies(database: AppDatabase = db): ConfirmedMethodology[] {
  const rows = database
    .select()
    .from(methodologies)
    .where(eq(methodologies.status, "confirmed"))
    .orderBy(methodologies.name, methodologies.id)
    .all();
  if (rows.length === 0) return [];
  const tagRows = database
    .select()
    .from(methodologyTags)
    .where(
      inArray(
        methodologyTags.methodologyId,
        rows.map((row) => row.id),
      ),
    )
    .all();
  const tagMap = new Map<string, string[]>();
  for (const row of tagRows) {
    tagMap.set(row.methodologyId, [...(tagMap.get(row.methodologyId) ?? []), row.tagId]);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    sourceId: row.sourceId,
    tagIds: tagMap.get(row.id) ?? [],
    body: row.body,
  }));
}

/** 全部已复盘练习中与掌握度有关的字段。 */
export function loadMasteryRecords(database: AppDatabase = db): MasteryRecord[] {
  return database
    .select({
      selectedMethodologyId: practiceSessions.selectedMethodologyId,
      targetMethodologyId: scenarios.targetMethodologyId,
      mode: practiceSessions.mode,
      hintUsed: practiceSessions.hintUsed,
      endedAt: practiceSessions.endedAt,
      executionScore: debriefs.executionScore,
      recognition: debriefs.recognition,
    })
    .from(practiceSessions)
    .innerJoin(scenarios, eq(scenarios.id, practiceSessions.scenarioId))
    .innerJoin(debriefs, eq(debriefs.sessionId, practiceSessions.id))
    .where(eq(practiceSessions.status, "debriefed"))
    .all()
    .flatMap((row) => (row.endedAt === null ? [] : [{ ...row, endedAt: row.endedAt }]));
}

interface Selection {
  target: ConfirmedMethodology;
  /** 范围内全部已确认方法论（含目标）。 */
  scoped: ConfirmedMethodology[];
}

/** 校验并确定目标方法论。 */
function selectTarget(
  params: CreatePracticeInput,
  confirmed: ConfirmedMethodology[],
  options: ScenarioServiceOptions,
  database: AppDatabase,
): Selection {
  const scoped = resolveScope(params.scope, confirmed);

  if (params.mode === "drill" && params.selection === "pick") {
    if (!params.methodologyId) {
      throw new ApiError(400, "invalid_input", "请指定 1 个已确认的方法论");
    }
    const target = confirmed.find((m) => m.id === params.methodologyId);
    if (!target) {
      throw new ApiError(400, "invalid_input", "所选方法论不存在，或尚未确认入库");
    }
    return { target, scoped };
  }

  if (params.mode === "quiz" && scoped.length < QUIZ_MIN_SCOPE_SIZE) {
    throw new ApiError(
      400,
      "invalid_input",
      `综合测验的选题范围内至少需要 ${QUIZ_MIN_SCOPE_SIZE} 个已确认方法论，当前范围内有 ${scoped.length} 个`,
    );
  }
  if (scoped.length === 0) {
    throw new ApiError(400, "invalid_input", "选题范围内没有已确认的方法论");
  }

  const records = loadMasteryRecords(database);
  const now = options.now ?? Date.now();
  const id = pickWeighted(
    scoped.map((m) => ({ id: m.id, mastery: computeMastery(m.id, records, now) })),
    options.rng ?? Math.random,
  );
  return { target: scoped.find((m) => m.id === id) as ConfirmedMethodology, scoped };
}

/**
 * 选题 → 生成场景 → 写入 scenarios，返回场景 ID。
 * 综合测验的候选列表 = 范围内全部已确认方法论；专项练习为 [目标]。
 */
export async function generateScenario(
  params: CreatePracticeInput,
  options: ScenarioServiceOptions = {},
): Promise<string> {
  const database = options.database ?? db;
  const confirmed = loadConfirmedMethodologies(database);
  const { target, scoped } = selectTarget(params, confirmed, options, database);
  const others = scoped.filter((m) => m.id !== target.id);

  const recentTitles = database
    .select({ title: scenarios.title })
    .from(scenarios)
    .where(eq(scenarios.targetMethodologyId, target.id))
    .orderBy(desc(scenarios.createdAt), desc(scenarios.id))
    .limit(SCENARIO_RECENT_TITLES)
    .all()
    .map((row) => row.title);

  const input = buildScenarioInput({
    mode: params.mode,
    difficulty: params.difficulty,
    target,
    others,
    recentTitles,
  });
  const output = await runTask(scenarioTask, input, {
    refType: "methodology",
    refId: target.id,
    signal: options.signal,
  });

  const stepIdByRef = new Map(target.body.steps.map((step, i) => [stepRef(i), step.id]));
  const otherIdByRef = new Map(others.map((m, i) => [methodologyRef(i), m.id]));
  const seenAlternatives = new Set<string>();
  const alternatives = output.alternatives.flatMap((alt) => {
    const methodologyId = otherIdByRef.get(alt.ref);
    if (!methodologyId || seenAlternatives.has(methodologyId)) return [];
    seenAlternatives.add(methodologyId);
    return [{ methodologyId, reason: alt.reason }];
  });

  const id = nanoid();
  database
    .insert(scenarios)
    .values({
      id,
      targetMethodologyId: target.id,
      targetVersion: target.version,
      difficulty: params.difficulty,
      scope: params.scope,
      candidateIds: params.mode === "quiz" ? scoped.map((m) => m.id) : [target.id],
      title: output.title,
      background: output.background,
      userRole: output.userRole,
      userGoal: output.userGoal,
      counterpartName: output.counterpart.name,
      counterpartRelation: output.counterpart.relation,
      counterpartProfile: output.counterpart.profile,
      openingSpeaker: output.openingSpeaker,
      openingLine: output.openingSpeaker === "counterpart" ? output.openingLine : null,
      brief: {
        personality: output.brief.personality,
        trueStance: output.brief.trueStance,
        hiddenConcerns: output.brief.hiddenConcerns,
        plannedResistance: output.brief.plannedResistance.map((r, i) => ({
          id: `r${i + 1}`,
          trigger: r.trigger,
          reaction: r.reaction,
          linkedStepId: r.linkedStepRef ? (stepIdByRef.get(r.linkedStepRef) ?? null) : null,
        })),
        yieldConditions: output.brief.yieldConditions,
        breakdownConditions: output.brief.breakdownConditions,
      },
      alternatives,
      designNotes: output.designNotes,
      promptVersion: scenarioTask.promptVersion,
      createdAt: Date.now(),
    })
    .run();
  return id;
}
