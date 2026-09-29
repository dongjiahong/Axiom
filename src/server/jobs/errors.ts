import {
  LLMNotConfiguredError,
  LLMOutputError,
  LLMTruncatedError,
  LLMUnavailableError,
} from "@/server/llm/errors";

/** 把任务中的异常转成可直接展示给用户的中文说明（不含 API Key 与内部细节）。 */
export function describeJobError(err: unknown): string {
  if (err instanceof LLMOutputError || err instanceof LLMTruncatedError) {
    return "AI 多次输出不合规，请重试";
  }
  if (err instanceof LLMNotConfiguredError || err instanceof LLMUnavailableError) {
    return err.message;
  }
  console.error("[job] 未处理的错误：", err instanceof Error ? err.message : err);
  return "处理时发生内部错误，请重试";
}
