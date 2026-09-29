import chardet from "chardet";
import iconv from "iconv-lite";

import {
  TEXT_NUMBERED_TITLE_MAX_COUNT,
  TEXT_NUMBERED_TITLE_MIN_COUNT,
  TEXT_TITLE_MAX_CHARS,
} from "@/domain/constants";

import { fallbackTitle, type ParsedSection, type ParsedSource } from "./detect";

/** txt 解析（algorithms.md §1.4–1.5）；标题正则同时供无书签 PDF 复用。 */

/** 前置内容（第一个标题之前的部分）的标题。 */
export const LEADING_SECTION_TITLE = "前言";

/** 中文编号标题：第X章 / 第三节 / 第一讲…… */
const CN_TITLE_RE = /^\s*(第[一二三四五六七八九十百千零〇\d]+[章节篇部回讲课])\s*.*$/;
/** 英文编号标题：Chapter 1 / PART II …… */
const EN_TITLE_RE = /^\s*(Chapter|CHAPTER|Part|PART)\s+[\dIVXLC]+\b.*$/;
/** 数字编号标题：1 / 1.2 / 3 概述（仅当全文匹配数在允许范围内时启用）。 */
const NUM_TITLE_RE = /^\s*\d{1,2}(\.\d{1,2})?\s+\S.{0,30}$/;

/** 按行拆分文本（保留原行，去不掉行首空白）。 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function isShortLine(line: string): boolean {
  return line.trim().length > 0 && line.trim().length <= TEXT_TITLE_MAX_CHARS;
}

/** 全文数字编号标题的匹配数，用于决定是否启用该规则。 */
export function countNumberedTitles(lines: string[]): number {
  return lines.filter((line) => isShortLine(line) && NUM_TITLE_RE.test(line)).length;
}

/** 是否启用数字编号标题规则（3–200 个匹配）。 */
export function isNumberedTitleEnabled(lines: string[]): boolean {
  const count = countNumberedTitles(lines);
  return count >= TEXT_NUMBERED_TITLE_MIN_COUNT && count <= TEXT_NUMBERED_TITLE_MAX_COUNT;
}

/** 判断单行是否是标题行；numberedEnabled 由 isNumberedTitleEnabled 决定。 */
export function isTitleLine(line: string, numberedEnabled: boolean): boolean {
  if (!isShortLine(line)) return false;
  if (CN_TITLE_RE.test(line) || EN_TITLE_RE.test(line)) return true;
  return numberedEnabled && NUM_TITLE_RE.test(line);
}

export interface RawSection {
  /** 标题行本身不计入 lines，标题为空表示第一个标题之前的正文。 */
  title: string | null;
  lines: string[];
}

/** 按标题正则把行序列切成若干节。 */
export function splitByTitles(lines: string[]): RawSection[] {
  const numberedEnabled = isNumberedTitleEnabled(lines);
  const sections: RawSection[] = [];
  let current: RawSection = { title: null, lines: [] };
  for (const line of lines) {
    if (isTitleLine(line, numberedEnabled)) {
      sections.push(current);
      current = { title: line.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

/** 把切分结果转成章节：无标题时整篇作为一节。 */
export function toSections(raw: RawSection[], defaultTitle: string): ParsedSection[] {
  const hasTitles = raw.some((section) => section.title !== null);
  if (!hasTitles) {
    const text = raw
      .map((section) => section.lines.join("\n"))
      .join("\n")
      .trim();
    return text ? [{ title: defaultTitle, text }] : [];
  }
  return raw
    .map((section) => ({
      title: section.title ?? LEADING_SECTION_TITLE,
      text: section.lines.join("\n").trim(),
    }))
    .filter((section) => section.text.length > 0);
}

/** 编码检测：GB 系列与 Big5 用 iconv-lite 转 UTF-8，其余按 UTF-8。 */
export function decodeText(buffer: Buffer): string {
  const detected = chardet.detect(buffer);
  const text =
    detected && /^(gb18030|gbk|gb2312|big5)/i.test(detected)
      ? iconv.decode(buffer, detected)
      : buffer.toString("utf8");
  return text.replace(/^\uFEFF/, "");
}

/** 严格 UTF-8 解码；不是合法 UTF-8 时返回 null。 */
export function decodeUtf8Strict(buffer: Buffer): string | null {
  const text = buffer.toString("utf8");
  return text.includes("\uFFFD") ? null : text;
}

export function parseTxt(buffer: Buffer, filename: string): ParsedSource {
  const text = decodeText(buffer);
  const sections = toSections(splitByTitles(splitLines(text)), fallbackTitle(filename));
  return { title: fallbackTitle(filename), author: null, sections };
}
