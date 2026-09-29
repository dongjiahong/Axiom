/** AI 层错误。接口层的 HTTP 映射见 src/server/http.ts。 */

/** 未配置 AI 模型（Base URL、API Key、模型名任一缺失）。 */
export class LLMNotConfiguredError extends Error {
  constructor(message = "请先在设置页配置 AI 模型") {
    super(message);
    this.name = "LLMNotConfiguredError";
  }
}

/** 多次尝试后，AI 输出仍不符合要求。 */
export class LLMOutputError extends Error {
  constructor(
    readonly task: string,
    readonly errors: string[],
  ) {
    super(`AI 多次输出不合规（${task}）：${errors.join("；")}`);
    this.name = "LLMOutputError";
  }
}

/** AI 端点报错、超时或无法连接。`detail` 已去除 API Key。 */
export class LLMUnavailableError extends Error {
  readonly status: number | null;
  readonly detail: string;

  constructor(message: string, options: { status?: number | null; detail?: string } = {}) {
    super(message);
    this.name = "LLMUnavailableError";
    this.status = options.status ?? null;
    this.detail = options.detail ?? "";
  }
}

/** 端点返回 finish_reason=length：输出被截断。runTask 将其当作一次无效输出处理。 */
export class LLMTruncatedError extends Error {
  constructor(
    readonly text: string,
    readonly promptTokens: number | null,
    readonly completionTokens: number | null,
  ) {
    super("AI 输出过长被截断");
    this.name = "LLMTruncatedError";
  }
}
