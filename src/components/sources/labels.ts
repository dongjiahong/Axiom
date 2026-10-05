import type { ExtractionStatus, SourceFormat, SourceStatus } from "@/server/db/schema";

/** 资料相关的界面文案（中文，与 CONTEXT.md 术语一致）。 */

export const FORMAT_LABELS: Record<SourceFormat, string> = {
  epub: "EPUB",
  pdf: "PDF",
  txt: "TXT",
  md: "Markdown",
};

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  parsing: "解析中",
  ready: "待抽取",
  extracting: "抽取中",
  extracted: "已抽取",
  failed: "解析失败",
};

export const CHUNK_STATUS_LABELS: Record<ExtractionStatus, string> = {
  pending: "待抽取",
  running: "抽取中",
  done: "已完成",
  failed: "抽取失败",
  skipped: "已跳过",
};

export function formatCharCount(count: number): string {
  return `${count.toLocaleString("zh-CN")} 字`;
}

export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString("zh-CN", {
    year: sameYear ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
