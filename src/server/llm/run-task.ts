import type { z } from "zod";

import { LLM_JSON_ATTEMPTS } from "@/domain/constants";
import { db, type AppDatabase } from "@/server/db/client";
import type { LLMTaskName } from "@/server/db/schema";
import { correctionPrompt, zodErrorToMessages } from "@/server/prompts/common";

import { recordLLMCall } from "./call-log";
import { OpenAICompatClient, type ChatMessage, type LLMClient } from "./client";
import { LLMOutputError, LLMTruncatedError } from "./errors";
import { isFakeLLM } from "./fake";
import { extractJson } from "./json";
import { getLLMSettings } from "./settings";

export type TaskName = Exclude<LLMTaskName, "test">;

export interface TaskDef<I, O> {
  name: TaskName;
  /** 如 'extract_chunk@1'，修改提示词或输出 schema 时递增。 */
  promptVersion: string;
  temperature: number;
  /** AI 输出结构（短引用形式）。 */
  schema: z.ZodType<O>;
  build(input: I): ChatMessage[];
  /** 语义校验，返回中文错误列表；空数组表示通过。 */
  validate?(output: O, input: I): string[];
  /** Fake 模式输出，必须能通过 schema 与 validate。 */
  fake(input: I): O;
}

export interface TaskContext {
  refType?: string;
  refId?: string;
  signal?: AbortSignal;
  /** 仅测试注入：默认使用全局数据库。 */
  db?: AppDatabase;
  /** 仅测试注入：默认按设置构造 OpenAICompatClient。 */
  client?: LLMClient;
}

const TRUNCATED_HINT = "输出过长被截断。请更精简地重新输出：减少冗余描述、缩短示例，同时保持 JSON 结构完整。";

function checkOutput<I, O>(
  def: TaskDef<I, O>,
  input: I,
  raw: unknown,
): { ok: true; data: O } | { ok: false; errors: string[] } {
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: zodErrorToMessages(parsed.error) };
  const errors = def.validate?.(parsed.data, input) ?? [];
  return errors.length === 0 ? { ok: true, data: parsed.data } : { ok: false, errors };
}

function runFake<I, O>(def: TaskDef<I, O>, input: I): O {
  const checked = checkOutput(def, input, def.fake(input));
  if (!checked.ok) {
    throw new Error(`任务 ${def.name} 的 fake() 输出未通过校验：${checked.errors.join("；")}`);
  }
  return checked.data;
}

/**
 * 执行一个 AI 任务：提示词约束 JSON → 提取 → Zod 校验 → 语义校验，
 * 不合规则带错误信息重试，最多 LLM_JSON_ATTEMPTS 次。
 * 传输层错误（LLMUnavailableError）不重试，直接抛出。
 */
export async function runTask<I, O>(
  def: TaskDef<I, O>,
  input: I,
  ctx: TaskContext = {},
): Promise<O> {
  if (isFakeLLM()) return runFake(def, input);

  const database = ctx.db ?? db;
  const client = ctx.client ?? new OpenAICompatClient(getLLMSettings(database));
  const model = client.model ?? "unknown";

  const messages = def.build(input);
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= LLM_JSON_ATTEMPTS; attempt++) {
    ctx.signal?.throwIfAborted();
    const logBase = {
      task: def.name,
      refType: ctx.refType,
      refId: ctx.refId,
      model,
      attempt,
      messages: [...messages],
    };
    const started = Date.now();

    let text: string;
    let promptTokens: number | null;
    let completionTokens: number | null;
    let errors: string[];
    let data: O | undefined;
    try {
      const res = await client.complete({
        messages: logBase.messages,
        temperature: def.temperature,
        json: true,
        signal: ctx.signal,
      });
      ({ text, promptTokens, completionTokens } = res);
      const extracted = extractJson(text);
      if (!extracted.ok) {
        errors = [extracted.error];
      } else {
        const checked = checkOutput(def, input, extracted.value);
        errors = checked.ok ? [] : checked.errors;
        if (checked.ok) data = checked.data;
      }
    } catch (err) {
      if (err instanceof LLMTruncatedError) {
        ({ text, promptTokens, completionTokens } = err);
        errors = [TRUNCATED_HINT];
      } else {
        recordLLMCall(database, {
          ...logBase,
          status: "transport_error",
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    recordLLMCall(database, {
      ...logBase,
      status: errors.length === 0 ? "ok" : "invalid_output",
      durationMs: Date.now() - started,
      promptTokens,
      completionTokens,
      responseText: text,
      error: errors.length === 0 ? null : errors.join("\n"),
    });

    if (errors.length === 0) return data as O;

    lastErrors = errors;
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: correctionPrompt(errors) },
    );
  }

  throw new LLMOutputError(def.name, lastErrors);
}
