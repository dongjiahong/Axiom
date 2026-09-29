import OpenAI from "openai";

import { LLM_TIMEOUT_MS, LLM_TRANSPORT_RETRIES } from "@/domain/constants";

import { LLMTruncatedError, LLMUnavailableError } from "./errors";
import type { LLMSettings } from "./settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletion {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LLMClient {
  /** 模型名，仅用于 llm_calls 记录；桩客户端可省略。 */
  readonly model?: string;
  complete(req: {
    messages: ChatMessage[];
    temperature: number;
    /** 希望输出 JSON。 */
    json: boolean;
    signal?: AbortSignal;
  }): Promise<LLMCompletion>;
}

export type LLMClientConfig = Pick<
  LLMSettings,
  "baseUrl" | "apiKey" | "model" | "supportsJsonMode" | "supportsTemperature"
> & {
  /** 仅测试注入。 */
  fetch?: typeof fetch;
};

/** 去掉文本中的 API Key，避免进入日志、llm_calls 或接口响应。 */
export function redactSecret(text: string, secret: string): string {
  return secret.length >= 4 ? text.split(secret).join("****") : text;
}

export class OpenAICompatClient implements LLMClient {
  readonly model: string;
  private readonly openai: OpenAI;

  constructor(private readonly config: LLMClientConfig) {
    this.model = config.model;
    this.openai = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_TRANSPORT_RETRIES,
      fetch: config.fetch,
    });
  }

  async complete(req: Parameters<LLMClient["complete"]>[0]): Promise<LLMCompletion> {
    const { supportsTemperature, supportsJsonMode } = this.config;
    let text = "";
    let finishReason: string | null = null;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    try {
      // 必须用流式：ModelScope 网关对耗时数分钟的非流式响应会丢掉响应体开头，
      // 导致 SDK 的 response.json() 报 "is not valid JSON"。
      const stream = await this.openai.chat.completions.create(
        {
          model: this.model,
          messages: req.messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(supportsTemperature !== false ? { temperature: req.temperature } : {}),
          ...(req.json && supportsJsonMode === true
            ? { response_format: { type: "json_object" as const } }
            : {}),
        },
        { signal: req.signal },
      );
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        text += choice?.delta?.content ?? "";
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }
    } catch (err) {
      if (req.signal?.aborted) throw err;
      throw this.toUnavailable(err);
    }

    if (finishReason === "length") {
      throw new LLMTruncatedError(text, promptTokens, completionTokens);
    }
    return { text, promptTokens, completionTokens };
  }

  private toUnavailable(err: unknown): LLMUnavailableError {
    const raw = err instanceof Error ? err.message : String(err);
    const detail = redactSecret(raw, this.config.apiKey);
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      return new LLMUnavailableError("AI 请求超时，请稍后重试", { detail });
    }
    if (err instanceof OpenAI.APIConnectionError) {
      return new LLMUnavailableError("无法连接到 AI 端点，请检查 Base URL 与网络", { detail });
    }
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? null;
      const message =
        status === 401 || status === 403
          ? "AI 端点拒绝了请求，请检查 API Key"
          : status === 404
            ? "AI 端点返回 404，请检查 Base URL 与模型名"
            : status === 429
              ? "AI 端点请求过于频繁，请稍后重试"
              : `AI 端点报错${status ? `（HTTP ${status}）` : ""}：${detail}`;
      return new LLMUnavailableError(message, { status, detail });
    }
    return new LLMUnavailableError(`AI 调用失败：${detail}`, { detail });
  }
}
