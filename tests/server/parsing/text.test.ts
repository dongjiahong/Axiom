import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  countNumberedTitles,
  decodeText,
  isNumberedTitleEnabled,
  parseTxt,
  splitByTitles,
  toSections,
} from "@/server/parsing/text";

function fixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", name));
}

describe("decodeText", () => {
  it("UTF-8 文本原样读出", () => {
    expect(decodeText(Buffer.from("第一章 开场", "utf8"))).toBe("第一章 开场");
  });

  it("GBK 文本按中文正确解码，不出现乱码", () => {
    const text = decodeText(fixture("sample-gbk.txt"));
    expect(text).not.toContain("\uFFFD");
    expect(text).toContain("第一章 开场的话");
    expect(text).toContain("复述对方的原话是成本最低的倾听技巧");
  });
});

describe("parseTxt", () => {
  it("按标题正则切出中文章节", () => {
    const parsed = parseTxt(fixture("sample-gbk.txt"), "sample-gbk.txt");
    expect(parsed.title).toBe("sample-gbk");
    expect(parsed.author).toBeNull();
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "第一章 开场的话",
      "第二章 认真倾听",
      "第三章 收尾与跟进",
    ]);
    expect(parsed.sections[0].text.startsWith("谈话的开场决定了后面能不能谈下去。")).toBe(true);
    expect(parsed.sections[2].text.endsWith("这句话会让对方更愿意保持联系。")).toBe(true);
  });

  it("没有标题时整篇作为一节", () => {
    const parsed = parseTxt(Buffer.from("这里只有一段正文，没有任何标题。", "utf8"), "无标题.txt");
    expect(parsed.sections).toEqual([
      { title: "无标题", text: "这里只有一段正文，没有任何标题。" },
    ]);
  });

  it("第一个标题之前的正文作为前言", () => {
    const parsed = parseTxt(
      Buffer.from("这是没有标题的开场白。\n第一章 正文\n正文内容在这里。", "utf8"),
      "书.txt",
    );
    expect(parsed.sections.map((section) => section.title)).toEqual(["前言", "第一章 正文"]);
    expect(parsed.sections[0].text).toBe("这是没有标题的开场白。");
  });
});

describe("标题正则", () => {
  it("数字编号标题需全文匹配 3–200 次才启用", () => {
    const enough = ["1 概述", "正文", "2 方法", "正文", "3 结论", "正文"];
    expect(countNumberedTitles(enough)).toBe(3);
    expect(isNumberedTitleEnabled(enough)).toBe(true);
    expect(splitByTitles(enough).map((section) => section.title)).toEqual([
      null,
      "1 概述",
      "2 方法",
      "3 结论",
    ]);

    const tooFew = ["1 概述", "正文", "2 方法", "正文"];
    expect(isNumberedTitleEnabled(tooFew)).toBe(false);
    expect(splitByTitles(tooFew).map((section) => section.title)).toEqual([null]);
  });

  it("超过 40 字的行不算标题", () => {
    const long = `第一章 ${"很长".repeat(30)}`;
    expect(splitByTitles([long, "正文"])).toEqual([{ title: null, lines: [long, "正文"] }]);
  });

  it("英文章节标题可识别", () => {
    const sections = splitByTitles(["Chapter 1 Intro", "text", "PART II More", "text"]);
    expect(sections.map((section) => section.title)).toEqual([null, "Chapter 1 Intro", "PART II More"]);
  });
});

describe("toSections", () => {
  it("丢掉只有标题没有正文的节", () => {
    const sections = toSections(
      [
        { title: "第一章", lines: [] },
        { title: "第二章", lines: ["内容"] },
      ],
      "默认标题",
    );
    expect(sections).toEqual([{ title: "第二章", text: "内容" }]);
  });
});
