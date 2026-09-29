import { FUZZY_SEGMENT_LENGTH, FUZZY_SEGMENT_STEP, FUZZY_THRESHOLD, MATCH_MIN_CHARS } from "./constants";
import type { SourceExcerpt } from "./schemas";

/** 文本归一化与原文摘录核对。纯函数，无 IO。 */

const DROPPED = /[\s\p{P}\p{S}]/u;

export interface NormalizedText {
  /** 归一化文本：NFKC、小写，去掉所有空白、标点、符号。 */
  text: string;
  /** 归一化文本第 i 个字符对应的原文起点（含）。 */
  starts: number[];
  /** 归一化文本第 i 个字符对应的原文终点（不含）。 */
  ends: number[];
}

/**
 * 逐个原文字符归一化，同时记录"归一化下标 → 原文下标"。
 * 一个原文字符可能展开成多个归一化字符（如全角连字），它们共用同一段原文区间。
 */
export function normalizeWithMap(input: string): NormalizedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const ch of input) {
    const start = index;
    index += ch.length;
    const normalized = ch.normalize("NFKC").toLowerCase();
    for (const unit of normalized) {
      if (DROPPED.test(unit)) continue;
      for (let i = 0; i < unit.length; i++) {
        starts.push(start);
        ends.push(index);
      }
      text += unit;
    }
  }
  return { text, starts, ends };
}

export function normalize(input: string): string {
  return normalizeWithMap(input).text;
}

export interface Haystack {
  id: string;
  text: string;
}

export interface TextMatch {
  match: "exact" | "fuzzy";
  haystackId: string;
  /** 命中位置对应的原文片段。 */
  text: string;
}

function segmentsOf(query: string): string[] {
  if (query.length < FUZZY_SEGMENT_LENGTH) return [query];
  const result: string[] = [];
  let start = 0;
  for (; start + FUZZY_SEGMENT_LENGTH <= query.length; start += FUZZY_SEGMENT_STEP) {
    result.push(query.slice(start, start + FUZZY_SEGMENT_LENGTH));
  }
  // 步长不能整除时，补上末尾片段，避免尾部内容不参与核对。
  if (start - FUZZY_SEGMENT_STEP + FUZZY_SEGMENT_LENGTH < query.length) {
    result.push(query.slice(query.length - FUZZY_SEGMENT_LENGTH));
  }
  return result;
}

function sliceOriginal(original: string, norm: NormalizedText, from: number, to: number): string {
  return original.slice(norm.starts[from], norm.ends[to - 1]);
}

/**
 * 在若干原文中查找一段文字：先精确、后模糊；都不命中返回 null。
 * 查询归一化后短于 MATCH_MIN_CHARS 时不核对（太短会随机命中）。
 */
export function findText(query: string, haystacks: Haystack[]): TextMatch | null {
  const q = normalize(query);
  if (q.length < MATCH_MIN_CHARS) return null;

  const prepared = haystacks.map((h) => ({ h, norm: normalizeWithMap(h.text) }));

  for (const { h, norm } of prepared) {
    const at = norm.text.indexOf(q);
    if (at >= 0) {
      return { match: "exact", haystackId: h.id, text: sliceOriginal(h.text, norm, at, at + q.length) };
    }
  }

  const segments = segmentsOf(q);
  let best: { ratio: number; haystackId: string; text: string } | null = null;
  for (const { h, norm } of prepared) {
    let hits = 0;
    let cursor = 0;
    let first = Infinity;
    let last = -1;
    for (const segment of segments) {
      let at = norm.text.indexOf(segment, cursor);
      if (at >= 0) cursor = at + segment.length;
      else at = norm.text.indexOf(segment);
      if (at < 0) continue;
      hits++;
      first = Math.min(first, at);
      last = Math.max(last, at + segment.length);
    }
    const ratio = hits / segments.length;
    if (ratio < FUZZY_THRESHOLD || (best && best.ratio >= ratio)) continue;
    const end = Math.min(last, first + q.length * 2);
    best = { ratio, haystackId: h.id, text: sliceOriginal(h.text, norm, first, end) };
  }
  return best ? { match: "fuzzy", haystackId: best.haystackId, text: best.text } : null;
}

/** 核对 AI 给出的原文摘录；命中时 `text` 替换为资料中的真实原文片段。 */
export function matchExcerpt(excerpt: string, haystacks: Haystack[]): SourceExcerpt {
  const found = findText(excerpt, haystacks);
  if (!found) return { text: excerpt, chunkId: null, match: "none" };
  return { text: found.text, chunkId: found.haystackId, match: found.match };
}
