import { CHUNK_MAX_CHARS, CHUNK_MIN_CHARS } from "@/domain/constants";

import type { ParsedSection } from "./detect";

/** 分块：章节 → 抽取的最小单位 SourceChunk。 */

export interface Chunk {
  /** 顺序号，从 1 开始。 */
  seq: number;
  title: string;
  text: string;
  /** 目录/版权等无需抽取的章节。 */
  skipped: boolean;
}

/** 标题命中即跳过抽取。 */
const SKIP_RE =
  /^(目录|版权|版权信息|致谢|参考文献|索引|出版说明|contents|copyright|acknowledg|index|bibliography)/i;

/** 按段落边界均分为若干份，每份不超过 max 字符。 */
export function splitByMaxChars(text: string, max: number = CHUNK_MAX_CHARS): string[] {
  const hardSplit = (piece: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max));
    return out;
  };
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const pieces = paragraphs.flatMap((paragraph) =>
    paragraph.length > max ? hardSplit(paragraph) : [paragraph],
  );

  const count = Math.ceil(text.length / max);
  const target = text.length / count;
  const parts: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && (current.length + 2 + piece.length > max || current.length >= target)) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

interface MergedSection {
  titles: string[];
  text: string;
  skipped: boolean;
}

/** 空节 → 跳过标记 → 合并过短节 → 切分过长节 → 重新编号。 */
export function buildChunks(sections: ParsedSection[]): Chunk[] {
  const items = sections
    .map((section) => ({
      title: section.title.trim(),
      text: section.text.trim(),
      skipped: SKIP_RE.test(section.title.trim()),
    }))
    .filter((section) => section.text.length > 0);

  const merged: MergedSection[] = [];
  let pending: { titles: string[]; text: string } | null = null;
  const flush = () => {
    if (pending) {
      merged.push({ ...pending, skipped: false });
      pending = null;
    }
  };

  for (const item of items) {
    if (item.skipped) {
      flush();
      merged.push({ titles: [item.title], text: item.text, skipped: true });
      continue;
    }
    if (pending) {
      pending.titles.push(item.title);
      pending.text += `\n\n${item.text}`;
    } else {
      pending = { titles: [item.title], text: item.text };
    }
    if (pending.text.length >= CHUNK_MIN_CHARS) flush();
  }
  flush();

  // 末尾过短的一段并入前一段（前一节被跳过时保持独立）。
  const last = merged.at(-1);
  const previous = merged.at(-2);
  if (
    last &&
    previous &&
    !last.skipped &&
    !previous.skipped &&
    last.text.length < CHUNK_MIN_CHARS
  ) {
    previous.titles.push(...last.titles);
    previous.text += `\n\n${last.text}`;
    merged.pop();
  }

  const chunks: Chunk[] = [];
  for (const item of merged) {
    const title = item.titles.join(" / ");
    const parts =
      item.skipped || item.text.length <= CHUNK_MAX_CHARS ? [item.text] : splitByMaxChars(item.text);
    parts.forEach((text, index) => {
      chunks.push({
        seq: 0,
        title: parts.length > 1 ? `${title}（${index + 1}/${parts.length}）` : title,
        text,
        skipped: item.skipped,
      });
    });
  }
  return chunks.map((chunk, index) => ({ ...chunk, seq: index + 1 }));
}
