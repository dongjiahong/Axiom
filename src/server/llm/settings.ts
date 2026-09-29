import { eq } from "drizzle-orm";
import { z } from "zod";

import { MAX_TURNS_DEFAULT } from "@/domain/constants";
import { db, type AppDatabase } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { isFakeLLM } from "./fake";
import { LLMNotConfiguredError } from "./errors";

/** 读写 `settings.llm` / `settings.practice`（data-model.md §3）；环境变量优先于数据库。 */

export interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsJsonMode: boolean | null;
  supportsTemperature: boolean | null;
  testedAt: number | null;
}

export interface PracticeSettings {
  maxTurns: number;
}

const StoredLLM = z.object({
  baseUrl: z.string().default(""),
  apiKey: z.string().default(""),
  model: z.string().default(""),
  supportsJsonMode: z.boolean().nullable().default(null),
  supportsTemperature: z.boolean().nullable().default(null),
  testedAt: z.number().nullable().default(null),
});

const StoredPractice = z.object({
  maxTurns: z.number().int().default(MAX_TURNS_DEFAULT),
});

const ENV_KEYS = {
  baseUrl: "AXIOM_LLM_BASE_URL",
  apiKey: "AXIOM_LLM_API_KEY",
  model: "AXIOM_LLM_MODEL",
} as const;

type EnvField = keyof typeof ENV_KEYS;

function readEnv(field: EnvField): string | undefined {
  const value = process.env[ENV_KEYS[field]]?.trim();
  return value ? value : undefined;
}

/** 是否有任一 AXIOM_LLM_* 环境变量在覆盖数据库值。 */
export function isLLMOverriddenByEnv(): boolean {
  return (Object.keys(ENV_KEYS) as EnvField[]).some((f) => readEnv(f) !== undefined);
}

function upsert(database: AppDatabase, key: string, value: Record<string, unknown>): void {
  database
    .insert(settings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
    .run();
}

function readRow(database: AppDatabase, key: string): unknown {
  return database.select().from(settings).where(eq(settings.key, key)).get()?.value ?? {};
}

/** 仅数据库中保存的值，不含环境变量。 */
export function readStoredLLMSettings(database: AppDatabase = db): LLMSettings {
  return StoredLLM.parse(readRow(database, "llm"));
}

/** 生效值（环境变量覆盖数据库）；可能有空字段，不抛错。 */
export function getEffectiveLLMSettings(database: AppDatabase = db): LLMSettings {
  const stored = readStoredLLMSettings(database);
  return {
    ...stored,
    baseUrl: readEnv("baseUrl") ?? stored.baseUrl,
    apiKey: readEnv("apiKey") ?? stored.apiKey,
    model: readEnv("model") ?? stored.model,
  };
}

/** 供 AI 调用使用；Base URL、API Key、模型名任一缺失时抛 LLMNotConfiguredError。 */
export function getLLMSettings(database: AppDatabase = db): LLMSettings {
  const effective = getEffectiveLLMSettings(database);
  if (!effective.baseUrl || !effective.apiKey || !effective.model) {
    throw new LLMNotConfiguredError();
  }
  return effective;
}

/** Fake 模式下视为已配置。 */
export function isLLMConfigured(database: AppDatabase = db): boolean {
  if (isFakeLLM()) return true;
  const { baseUrl, apiKey, model } = getEffectiveLLMSettings(database);
  return Boolean(baseUrl && apiKey && model);
}

export interface SaveLLMSettingsInput {
  baseUrl: string;
  /** 省略或为空表示不修改。 */
  apiKey?: string;
  model: string;
}

/** 保存 AI 设置；连接参数有变化时清空能力探测结果。 */
export function saveLLMSettings(
  input: SaveLLMSettingsInput,
  database: AppDatabase = db,
): LLMSettings {
  const current = readStoredLLMSettings(database);
  const newKey = input.apiKey?.trim();
  const next: LLMSettings = {
    ...current,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    apiKey: newKey ? newKey : current.apiKey,
  };
  const changed =
    next.baseUrl !== current.baseUrl ||
    next.model !== current.model ||
    next.apiKey !== current.apiKey;
  if (changed) {
    next.supportsJsonMode = null;
    next.supportsTemperature = null;
    next.testedAt = null;
  }
  upsert(database, "llm", next as unknown as Record<string, unknown>);
  return next;
}

/** 记录测试连接探测到的能力。 */
export function saveLLMProbe(
  probe: Pick<LLMSettings, "supportsJsonMode" | "supportsTemperature">,
  database: AppDatabase = db,
): void {
  const next: LLMSettings = {
    ...readStoredLLMSettings(database),
    ...probe,
    testedAt: Date.now(),
  };
  upsert(database, "llm", next as unknown as Record<string, unknown>);
}

export function getPracticeSettings(database: AppDatabase = db): PracticeSettings {
  return StoredPractice.parse(readRow(database, "practice"));
}

export function savePracticeSettings(
  input: PracticeSettings,
  database: AppDatabase = db,
): PracticeSettings {
  upsert(database, "practice", { maxTurns: input.maxTurns });
  return { maxTurns: input.maxTurns };
}

/** `sk-abcdef123456` → `sk-****3456`；太短的 Key 只显示 `****`。 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "****";
  const prefix = apiKey.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${apiKey.slice(-4)}`;
}
