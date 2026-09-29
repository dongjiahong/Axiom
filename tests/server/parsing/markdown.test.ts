import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMarkdown } from "@/server/parsing/markdown";

function fixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", name));
}

describe("parseMarkdown", () => {
  it("选择能切出 3–200 节的分节级别", () => {
    const parsed = parseMarkdown(fixture("sample.md"), "sample.md");
    expect(parsed.title).toBe("沟通方法论笔记");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "沟通方法论笔记",
      "第一章 倾听",
      "第二章 提问",
      "第三章 收尾",
    ]);
  });

  it("去掉 Markdown 标记，只保留文本", () => {
    const parsed = parseMarkdown(fixture("sample.md"), "sample.md");
    const first = parsed.sections.find((section) => section.title === "第一章 倾听");
    expect(first?.text).toContain("倾听的关键是先接住情绪，再处理事情。参考复述技巧。");
    expect(first?.text).toContain("复述对方原话");
    expect(first?.text).not.toContain("**");
    expect(first?.text).not.toContain("https://example.com");
    expect(first?.text).not.toContain("- ");
  });

  it("节数不满足范围时退回按 # 切分", () => {
    const parsed = parseMarkdown(
      Buffer.from("# 书名\n\n简介。\n\n## 第一章\n\n正文。\n", "utf8"),
      "book.md",
    );
    expect(parsed.title).toBe("书名");
    expect(parsed.sections).toEqual([
      { title: "书名", text: "简介。\n第一章\n正文。" },
    ]);
  });

  it("没有标题时整篇作为一节", () => {
    const parsed = parseMarkdown(Buffer.from("只有正文，没有标题。", "utf8"), "无标题.md");
    expect(parsed.title).toBe("无标题");
    expect(parsed.sections).toEqual([{ title: "前言", text: "只有正文，没有标题。" }]);
  });
});
