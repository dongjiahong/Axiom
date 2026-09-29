import { z } from "zod";

import { MAX_TURNS_MAX, MAX_TURNS_MIN } from "@/domain/constants";
import { db, type AppDatabase } from "@/server/db/client";
import { toSettingsDto, type SettingsDto } from "@/server/dto/settings";
import { OpenAICompatClient, type LLMClient, type LLMClientConfig } from "@/server/llm/client";
import { recordLLMCall } from "@/server/llm/call-log";
import { LLMUnavailableError } from "@/server/llm/errors";
import { isFakeLLM } from "@/server/llm/fake";
import { extractJson } from "@/server/llm/json";
import {
  getEffectiveLLMSettings,
  getLLMSettings,
  getPracticeSettings,
  isLLMOverriddenByEnv,
  saveLLMProbe,
  saveLLMSettings,
  savePracticeSettings,
} from "@/server/llm/settings";

export const UpdateLLMSettingsInput = z.object({
  baseUrl: z.url({ protocol: /^https?$/, error: "应为 http(s) 地址" }),
  apiKey: z.string().optional(),
  model: z.string().trim().min(1),
});

export const UpdatePracticeSettingsInput = z.object({
  maxTurns: z.number().int().min(MAX_TURNS_MIN).max(MAX_TURNS_MAX),
});

export interface LLMTestResult {
  ok: true;
  latencyMs: number;
  supportsJsonMode: boolean;
  supportsTemperature: boolean;
  sample: string;
}

export function getSettings(database: AppDatabase = db): SettingsDto {
  return toSettingsDto({
    llm: getEffectiveLLMSettings(database),
    overriddenByEnv: isLLMOverriddenByEnv(),
    practice: getPracticeSettings(database),
  });
}

export function updateLLMSettings(
  input: z.infer<typeof UpdateLLMSettingsInput>,
  database: AppDatabase = db,
): SettingsDto {
  saveLLMSettings(input, database);
  return getSettings(database);
}

export function updatePracticeSettings(
  input: z.infer<typeof UpdatePracticeSettingsInput>,
  database: AppDatabase = db,
): SettingsDto {
  savePracticeSettings(input, database);
  return getSettings(database);
}

/**
 * 测试连接：探测 temperature 与 JSON 模式支持，结果写回 settings.llm。
 * Fake 模式下不访问网络，也不写回探测结果。
 */
export async function testLLMConnection(
  options: {
    database?: AppDatabase;
    createClient?: (config: LLMClientConfig) => LLMClient;
  } = {},
): Promise<LLMTestResult> {
  if (isFakeLLM()) {
    return {
      ok: true,
      latencyMs: 0,
      supportsJsonMode: true,
      supportsTemperature: true,
      sample: "（Fake 模式：未连接真实端点）",
    };
  }

  const database = options.database ?? db;
  const createClient = options.createClient ?? ((config) => new OpenAICompatClient(config));
  const settings = getLLMSettings(database);

  const call = async (
    probe: { supportsTemperature: boolean; json: boolean },
    prompt: string,
  ) => {
    const client = createClient({
      ...settings,
      supportsTemperature: probe.supportsTemperature,
      supportsJsonMode: true,
    });
    const messages = [{ role: "user" as const, content: prompt }];
    const started = Date.now();
    const log = { task: "test" as const, model: settings.model, attempt: 1, messages };
    try {
      const res = await client.complete({ messages, temperature: 0.2, json: probe.json });
      const durationMs = Date.now() - started;
      recordLLMCall(database, {
        ...log,
        status: "ok",
        durationMs,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        responseText: res.text,
      });
      return { ...res, durationMs };
    } catch (err) {
      recordLLMCall(database, {
        ...log,
        status: "transport_error",
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const isBadRequest = (err: unknown, keyword?: RegExp) =>
    err instanceof LLMUnavailableError &&
    err.status === 400 &&
    (keyword ? keyword.test(err.detail) : true);

  let supportsTemperature = true;
  let first;
  try {
    first = await call({ supportsTemperature, json: false }, "请只回复：好");
  } catch (err) {
    if (!isBadRequest(err, /temperature/i)) throw err;
    supportsTemperature = false;
    first = await call({ supportsTemperature, json: false }, "请只回复：好");
  }

  let supportsJsonMode: boolean;
  try {
    const second = await call({ supportsTemperature, json: true }, '请输出 JSON：{"ok": true}');
    supportsJsonMode = extractJson(second.text).ok;
  } catch (err) {
    if (!isBadRequest(err)) throw err;
    supportsJsonMode = false;
  }

  saveLLMProbe({ supportsJsonMode, supportsTemperature }, database);
  return {
    ok: true,
    latencyMs: first.durationMs,
    supportsJsonMode,
    supportsTemperature,
    sample: first.text.trim(),
  };
}
