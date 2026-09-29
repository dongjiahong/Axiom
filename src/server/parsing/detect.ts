import { ParseError } from "./errors";

/** 资料解析。 */

/** 资料格式（与 db/schema.ts 的 SourceFormat 一致）。 */
export type SourceFormat = "epub" | "pdf" | "txt" | "md";

/** 解析出的章节，尚未做大小调整。 */
export interface ParsedSection {
  title: string;
  text: string;
}

/** 所有解析器统一输出。 */
export interface ParsedSource {
  title: string;
  author: string | null;
  sections: ParsedSection[];
}

const EXTENSION_FORMATS: Record<string, SourceFormat> = {
  epub: "epub",
  pdf: "pdf",
  txt: "txt",
  md: "md",
  markdown: "md",
};

/** 按扩展名判断格式；不支持的扩展名返回 null。 */
export function detectFormat(filename: string): SourceFormat | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_FORMATS[filename.slice(dot + 1).toLowerCase()] ?? null;
}

/** 文件名去掉扩展名，作为解析不出标题时的兜底标题。 */
export function fallbackTitle(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const title = dot > 0 ? base.slice(0, dot) : base;
  return title.trim() || "未命名资料";
}

const MAGIC_CHECKS: Partial<Record<SourceFormat, (buffer: Buffer) => boolean>> = {
  // epub 是 zip：以 PK\x03\x04 开头
  epub: (buffer) => buffer.subarray(0, 4).toString("latin1") === "PK\x03\x04",
  pdf: (buffer) => buffer.subarray(0, 4).toString("latin1") === "%PDF",
};

/** 魔数与扩展名不一致时报错（txt/md 无魔数，不做校验）。 */
export function assertFormatMatchesContent(format: SourceFormat, buffer: Buffer): void {
  const check = MAGIC_CHECKS[format];
  if (check && !check(buffer)) {
    throw new ParseError("文件内容与扩展名不符，请确认文件是否损坏或改过后缀名");
  }
}
