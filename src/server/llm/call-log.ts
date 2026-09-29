import { nanoid } from "nanoid";

import { LLM_LOG_MAX_CHARS } from "@/domain/constants";
import type { AppDatabase } from "@/server/db/client";
import { llmCalls, type LLMCallStatus, type LLMTaskName } from "@/server/db/schema";

import type { ChatMessage } from "./client";

function truncate(text: string): string {
  return text.length > LLM_LOG_MAX_CHARS
    ? `${text.slice(0, LLM_LOG_MAX_CHARS)}…（已截断）`
    : text;
}

/** 写入一条 llm_calls。messages 来自提示词，不含 API Key。 */
export function recordLLMCall(
  database: AppDatabase,
  entry: {
    task: LLMTaskName;
    refType?: string | null;
    refId?: string | null;
    model: string;
    attempt: number;
    status: LLMCallStatus;
    durationMs: number;
    promptTokens?: number | null;
    completionTokens?: number | null;
    messages: ChatMessage[];
    responseText?: string | null;
    error?: string | null;
  },
): void {
  database
    .insert(llmCalls)
    .values({
      id: nanoid(),
      task: entry.task,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      model: entry.model,
      attempt: entry.attempt,
      status: entry.status,
      durationMs: entry.durationMs,
      promptTokens: entry.promptTokens ?? null,
      completionTokens: entry.completionTokens ?? null,
      requestMessages: truncate(JSON.stringify(entry.messages)),
      responseText: entry.responseText == null ? null : truncate(entry.responseText),
      error: entry.error ?? null,
      createdAt: Date.now(),
    })
    .run();
}
