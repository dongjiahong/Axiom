import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { SCENARIO_RECENT_TITLES } from "@/domain/constants";
import type { MethodologyBody } from "@/domain/schemas";
import { pickRandom, resolveScope } from "@/domain/selection";
import { db, type AppDatabase } from "@/server/db/client";
import { methodologies, methodologyTags, scenarios } from "@/server/db/schema";
import type { CreatePracticeInput } from "@/server/dto/session";
import { ApiError } from "@/server/http";
import { runTask } from "@/server/llm/run-task";
import { buildScenarioInput, scenarioTask, stepRef } from "@/server/prompts/scenario";

/** 选题与场景生成。 */

export interface ScenarioServiceOptions {
  database?: AppDatabase;
  signal?: AbortSignal;
  /** 仅测试注入：随机选题的随机源。 */
  rng?: () => number;
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

/** 校验并确定目标方法论。 */
function selectTarget(
  params: CreatePracticeInput,
  confirmed: ConfirmedMethodology[],
  options: ScenarioServiceOptions,
): ConfirmedMethodology {
  if (params.selection === "pick") {
    if (!params.methodologyId) {
      throw new ApiError(400, "invalid_input", "请指定 1 个已确认的方法论");
    }
    const target = confirmed.find((m) => m.id === params.methodologyId);
    if (!target) {
      throw new ApiError(400, "invalid_input", "所选方法论不存在，或尚未确认入库");
    }
    return target;
  }

  const scoped = resolveScope(params.scope, confirmed);
  if (scoped.length === 0) {
    throw new ApiError(400, "invalid_input", "选题范围内没有已确认的方法论");
  }
  return pickRandom(scoped, options.rng ?? Math.random);
}

/** 选题 → 生成场景 → 写入 scenarios，返回场景 ID。 */
export async function generateScenario(
  params: CreatePracticeInput,
  options: ScenarioServiceOptions = {},
): Promise<string> {
  const database = options.database ?? db;
  const target = selectTarget(params, loadConfirmedMethodologies(database), options);

  const recentTitles = database
    .select({ title: scenarios.title })
    .from(scenarios)
    .where(eq(scenarios.targetMethodologyId, target.id))
    .orderBy(desc(scenarios.createdAt), desc(scenarios.id))
    .limit(SCENARIO_RECENT_TITLES)
    .all()
    .map((row) => row.title);

  const input = buildScenarioInput({
    difficulty: params.difficulty,
    target,
    recentTitles,
  });
  const output = await runTask(scenarioTask, input, {
    refType: "methodology",
    refId: target.id,
    signal: options.signal,
  });

  const stepIdByRef = new Map(target.body.steps.map((step, i) => [stepRef(i), step.id]));

  const id = nanoid();
  database
    .insert(scenarios)
    .values({
      id,
      targetMethodologyId: target.id,
      targetVersion: target.version,
      difficulty: params.difficulty,
      scope: params.scope,
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
      designNotes: output.designNotes,
      promptVersion: scenarioTask.promptVersion,
      createdAt: Date.now(),
    })
    .run();
  return id;
}
