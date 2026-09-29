import { MD_SECTION_MAX_COUNT, MD_SECTION_MIN_COUNT } from "@/domain/constants";

import { fallbackTitle, type ParsedSection, type ParsedSource } from "./detect";
import {
  decodeText,
  decodeUtf8Strict,
  LEADING_SECTION_TITLE,
  splitLines,
  type RawSection,
} from "./text";

/** Markdown 解析。 */

/** 依次尝试 #、##、### 作为分节级别（只看该级别的标题）。 */
const LEVELS = [1, 2, 3];

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}$/;

function headingText(line: string): string | null {
  const match = HEADING_RE.exec(line);
  return match ? match[2].trim() : null;
}

function splitAtLevel(lines: string[], level: number): RawSection[] {
  const re = new RegExp(`^\\s{0,3}#{${level}}\\s+(.*)$`);
  const sections: RawSection[] = [];
  let current: RawSection = { title: null, lines: [] };
  for (const line of lines) {
    const match = re.exec(line);
    if (match) {
      sections.push(current);
      current = { title: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

/** 去掉 Markdown 标记，只保留文本。 */
function stripInline(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function stripMarkdown(lines: string[]): string {
  return lines
    .filter((line) => !FENCE_RE.test(line) && !HR_RE.test(line))
    .map(stripInline)
    .filter((line) => line.length > 0)
    .join("\n");
}

function leadingBlockTitle(lines: string[]): string {
  for (const line of lines) {
    const text = headingText(line);
    if (text) return text;
  }
  return LEADING_SECTION_TITLE;
}

function toSections(raw: RawSection[]): ParsedSection[] {
  return raw
    .map((section) => ({
      title: section.title ?? leadingBlockTitle(section.lines),
      text: stripMarkdown(section.lines),
    }))
    .filter((section) => section.text.length > 0);
}

function chooseSections(lines: string[]): ParsedSection[] {
  for (const level of LEVELS) {
    const sections = toSections(splitAtLevel(lines, level));
    if (sections.length >= MD_SECTION_MIN_COUNT && sections.length <= MD_SECTION_MAX_COUNT) {
      return sections;
    }
  }
  return toSections(splitAtLevel(lines, 1));
}

export function parseMarkdown(buffer: Buffer, filename: string): ParsedSource {
  const text = decodeUtf8Strict(buffer) ?? decodeText(buffer);
  const lines = splitLines(text);
  const title = lines.map(headingText).find((text) => text !== null) ?? fallbackTitle(filename);
  return { title, author: null, sections: chooseSections(lines) };
}
