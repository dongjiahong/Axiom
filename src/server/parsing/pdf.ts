import { PDF_HEADER_FOOTER_PAGE_RATIO, PDF_MIN_CHARS_PER_PAGE } from "@/domain/constants";
import { extractText, getDocumentProxy, getMeta } from "unpdf";

import { fallbackTitle, type ParsedSection, type ParsedSource } from "./detect";
import { ParseError } from "./errors";
import {
  isNumberedTitleEnabled,
  isTitleLine,
  LEADING_SECTION_TITLE,
  splitByTitles,
} from "./text";

/**
 * PDF 解析（algorithms.md §1.3）。
 * 书签为节的边界；无书签则用标题正则；都没有则整本作为一节交给分块阶段。
 */

type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

/** 句末标点：行尾是它就不与下一行拼接。 */
const SENTENCE_END_RE = /[。！？!?…；;：:]["'”’）)】」』]?$/;

interface LineSection {
  title: string;
  lines: string[];
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function firstNonBlankIndex(lines: string[]): number {
  return lines.findIndex((line) => !isBlank(line));
}

function lastNonBlankIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!isBlank(lines[i])) return i;
  }
  return -1;
}

/** 删除在 ≥50% 页面首行/末行重复出现的页眉页脚。 */
function removeHeadersFooters(pages: string[][]): string[][] {
  if (pages.length < 2) return pages;

  const counts = (pick: (lines: string[]) => number) => {
    const map = new Map<string, number>();
    for (const lines of pages) {
      const index = pick(lines);
      if (index < 0) continue;
      const text = lines[index].trim();
      map.set(text, (map.get(text) ?? 0) + 1);
    }
    return map;
  };
  const threshold = pages.length * PDF_HEADER_FOOTER_PAGE_RATIO;
  const repeated = (map: Map<string, number>) =>
    new Set([...map].filter(([, count]) => count >= threshold).map(([text]) => text));

  const headers = repeated(counts(firstNonBlankIndex));
  const footers = repeated(counts(lastNonBlankIndex));

  return pages.map((lines) => {
    const result = [...lines];
    const first = firstNonBlankIndex(result);
    if (first >= 0 && headers.has(result[first].trim())) result.splice(first, 1);
    const last = lastNonBlankIndex(result);
    if (last >= 0 && footers.has(result[last].trim())) result.splice(last, 1);
    return result;
  });
}

/** 把各页文本拼成行序列，并记录每页的起始行号。 */
function flattenPages(pages: string[][]): { allLines: string[]; pageStart: number[] } {
  const allLines: string[] = [];
  const pageStart: number[] = [];
  for (const lines of pages) {
    pageStart.push(allLines.length);
    for (const line of lines) {
      if (!isBlank(line)) allLines.push(line);
    }
  }
  return { allLines, pageStart };
}

/** 合并被换行打断的句子；中文直接拼接，英文（两侧都是 ASCII 字母数字）补一个空格。 */
function joinWrappedLines(lines: string[], numberedEnabled: boolean): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out.at(-1);
    const joinable =
      previous !== undefined &&
      !SENTENCE_END_RE.test(previous.trim()) &&
      !isTitleLine(previous, numberedEnabled) &&
      !isTitleLine(line, numberedEnabled) &&
      !/^\s/.test(line);
    if (joinable) {
      const needsSpace = /[ -~]$/.test(previous) && /^[A-Za-z0-9]/.test(line);
      out[out.length - 1] = `${previous.trimEnd()}${needsSpace ? " " : ""}${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

async function readOutline(pdf: PdfProxy): Promise<{ title: string; pageIndex: number }[]> {
  let outline: Awaited<ReturnType<PdfProxy["getOutline"]>>;
  try {
    outline = await pdf.getOutline();
  } catch {
    return [];
  }
  if (!outline || outline.length === 0) return [];

  const result: { title: string; pageIndex: number }[] = [];
  for (const item of outline) {
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest) || dest.length === 0) continue;
      const pageIndex = await pdf.getPageIndex(dest[0]);
      const title = (item.title ?? "").trim();
      if (title && pageIndex >= 0) result.push({ title, pageIndex });
    } catch {
      continue;
    }
  }
  return result;
}

async function readMeta(pdf: PdfProxy): Promise<{ title: string | null; author: string | null }> {
  try {
    const { info } = await getMeta(pdf);
    const title = typeof info?.Title === "string" ? info.Title.trim() : "";
    const author = typeof info?.Author === "string" ? info.Author.trim() : "";
    return { title: title || null, author: author || null };
  } catch {
    return { title: null, author: null };
  }
}

function sectionsFromTitles(allLines: string[], title: string): LineSection[] {
  const raw = splitByTitles(allLines);
  if (!raw.some((section) => section.title !== null)) return [{ title, lines: allLines }];
  return raw.map((section) => ({
    title: section.title ?? LEADING_SECTION_TITLE,
    lines: section.lines,
  }));
}

export async function parsePdf(buffer: Buffer, filename: string): Promise<ParsedSource> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((page) => page.split(/\r?\n/));

  const effectiveChars = pages.reduce(
    (sum, lines) => sum + lines.join("").replace(/\s/g, "").length,
    0,
  );
  if (pages.length > 0 && effectiveChars / pages.length < PDF_MIN_CHARS_PER_PAGE) {
    throw new ParseError("疑似扫描版 PDF，暂不支持，请先转成文字版或 txt");
  }

  const { allLines, pageStart } = flattenPages(removeHeadersFooters(pages));
  const numberedEnabled = isNumberedTitleEnabled(allLines);

  const meta = await readMeta(pdf);
  const title = meta.title ?? fallbackTitle(filename);

  let sections: LineSection[] = [];
  const outline = await readOutline(pdf);
  if (outline.length > 0) {
    const bounds: { title: string; index: number }[] = [];
    for (const item of outline) {
      const index = pageStart[item.pageIndex];
      if (index === undefined) continue;
      const previous = bounds.at(-1);
      if (previous && index <= previous.index) continue;
      bounds.push({ title: item.title, index });
    }
    sections = bounds.map((bound, i) => ({
      title: bound.title,
      lines: allLines.slice(
        bound.index,
        i + 1 < bounds.length ? bounds[i + 1].index : allLines.length,
      ),
    }));
  }
  if (sections.length === 0) sections = sectionsFromTitles(allLines, title);

  return {
    title,
    author: meta.author,
    sections: sections
      .map((section) => ({
        title: section.title,
        text: joinWrappedLines(section.lines, numberedEnabled).join("\n").trim(),
      }))
      .filter((section): section is ParsedSection => section.text.length > 0),
  };
}
