import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectFormat, fallbackTitle } from "@/server/parsing/detect";
import { parseMarkdown } from "@/server/parsing/markdown";
import { parseTxt } from "@/server/parsing/text";
import { ParseError } from "@/server/parsing/errors";
import type { ParsedSource } from "@/server/parsing/detect";

/** 按格式分发到各解析器（service 层用，这里只测解析结果）。 */

const FIXTURE_NAMES = [
  "sample.epub",
  "sample-no-toc.epub",
  "sample-gbk.txt",
  "sample.md",
  "sample.pdf",
  "sample-no-bookmark.pdf",
] as const;

describe("夹具统一解析", () => {
  it("每种夹具都能解析出非空章节列表", async () => {
    const results: Record<string, ParsedSource> = {};
    for (const name of FIXTURE_NAMES) {
      const buffer = readFileSync(join(process.cwd(), "tests/fixtures", name));
      const format = detectFormat(name);
      expect(format).not.toBeNull();
      let parsed: ParsedSource;
      if (format === "md") parsed = parseMarkdown(buffer, name);
      else if (format === "txt") parsed = parseTxt(buffer, name);
      else {
        const { parseEpub } = await import("@/server/parsing/epub");
        const { parsePdf } = await import("@/server/parsing/pdf");
        parsed = format === "epub" ? await parseEpub(buffer, name) : await parsePdf(buffer, name);
      }
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(parsed.sections.length).toBeGreaterThan(0);
      for (const section of parsed.sections) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.text.length).toBeGreaterThan(0);
      }
      results[name] = parsed;
    }
    expect(Object.keys(results)).toHaveLength(FIXTURE_NAMES.length);
  });
});

describe("扩展名与内容不一致", () => {
  it("把 pdf 改名成 epub 时解析报错", async () => {
    const { parseEpub } = await import("@/server/parsing/epub");
    const pdf = readFileSync(join(process.cwd(), "tests/fixtures", "sample.pdf"));
    await expect(parseEpub(pdf, "fake.epub")).rejects.toThrow(ParseError);
  });
});

describe("fallbackTitle 与 detectFormat 组合", () => {
  it("未知扩展名没有格式但有兜底标题", () => {
    expect(detectFormat("book.zip")).toBeNull();
    expect(fallbackTitle("book.zip")).toBe("book");
  });
});
