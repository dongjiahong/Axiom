import type { z } from "zod";

import {
  LLMNotConfiguredError,
  LLMOutputError,
  LLMTruncatedError,
  LLMUnavailableError,
} from "@/server/llm/errors";
import { zodErrorToMessages } from "@/server/prompts/common";

/** 接口层通用工具：错误响应 `{ error: { code, message } }`（api-and-ui.md §1）。 */

export type ApiErrorCode =
  | "invalid_input"
  | "not_found"
  | "invalid_state"
  | "llm_not_configured"
  | "llm_invalid_output"
  | "llm_unavailable"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 把任意错误映射为统一的错误响应；message 为可直接展示的中文。 */
export function errorResponse(err: unknown): Response {
  let status = 500;
  let code: ApiErrorCode = "internal_error";
  let message = "服务器内部错误，请稍后重试";

  if (err instanceof ApiError) {
    ({ status, code, message } = err);
  } else if (err instanceof LLMNotConfiguredError) {
    status = 409;
    code = "llm_not_configured";
    message = err.message;
  } else if (err instanceof LLMOutputError || err instanceof LLMTruncatedError) {
    status = 502;
    code = "llm_invalid_output";
    message = "AI 多次输出不合规，请重试";
  } else if (err instanceof LLMUnavailableError) {
    status = 502;
    code = "llm_unavailable";
    message = err.message;
  } else {
    console.error("[api] 未处理的错误：", err instanceof Error ? err.message : err);
  }

  return Response.json({ error: { code, message } }, { status });
}

/** 解析并校验 JSON 请求体；不合法时抛 400 invalid_input。 */
export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_input", "请求体不是合法的 JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", `入参不合法：${zodErrorToMessages(parsed.error).join("；")}`);
  }
  return parsed.data;
}

/** 包装路由处理函数：正常结果转 JSON，异常统一映射。 */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return Response.json(await handler(...args));
    } catch (err) {
      return errorResponse(err);
    }
  };
}
