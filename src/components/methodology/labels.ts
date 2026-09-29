import type { MethodologyCreatedBy, MethodologyStatus } from "@/server/db/schema";

/** 方法论相关的界面文案（中文，与 CONTEXT.md 术语一致）。 */

export const STATUS_LABELS: Record<MethodologyStatus, string> = {
  draft: "候选",
  confirmed: "已确认",
  archived: "已归档",
};

export const CREATED_BY_LABELS: Record<MethodologyCreatedBy, string> = {
  extraction: "抽取",
  merge: "合并",
  split: "拆分",
  manual: "手动",
  seed: "种子",
};

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new RequestError(data?.error?.message ?? "操作失败", data?.error?.issues);
  return data as T;
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}
