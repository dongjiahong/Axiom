import { describe, expect, it } from "vitest";

import {
  assertFormatMatchesContent,
  detectFormat,
  fallbackTitle,
} from "@/server/parsing/detect";
import { ParseError } from "@/server/parsing/errors";

describe("detectFormat", () => {
  it("按扩展名判断格式", () => {
    expect(detectFormat("book.epub")).toBe("epub");
    expect(detectFormat("book.PDF")).toBe("pdf");
    expect(detectFormat("notes.txt")).toBe("txt");
    expect(detectFormat("notes.markdown")).toBe("md");
  });

  it("不支持的扩展名返回 null", () => {
    expect(detectFormat("book.docx")).toBeNull();
    expect(detectFormat("book")).toBeNull();
  });
});

describe("fallbackTitle", () => {
  it("去掉扩展名与目录", () => {
    expect(fallbackTitle("some/dir/沟通的艺术.epub")).toBe("沟通的艺术");
    expect(fallbackTitle("带.点.的文件名.txt")).toBe("带.点.的文件名");
    expect(fallbackTitle(".gitignore")).toBe(".gitignore");
  });
});

describe("assertFormatMatchesContent", () => {
  it("魔数与扩展名一致时通过", () => {
    expect(() =>
      assertFormatMatchesContent("pdf", Buffer.from("%PDF-1.7\n")),
    ).not.toThrow();
    expect(() =>
      assertFormatMatchesContent("epub", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("x")])),
    ).not.toThrow();
  });

  it("epub 实际是 pdf 时报错", () => {
    expect(() => assertFormatMatchesContent("epub", Buffer.from("%PDF-1.7"))).toThrow(ParseError);
    expect(() => assertFormatMatchesContent("epub", Buffer.from("%PDF-1.7"))).toThrow(
      "文件内容与扩展名不符",
    );
  });

  it("pdf 实际是纯文本时报错", () => {
    expect(() => assertFormatMatchesContent("pdf", Buffer.from("第一章"))).toThrow(ParseError);
  });

  it("txt 与 md 不做魔数校验", () => {
    expect(() => assertFormatMatchesContent("txt", Buffer.from("随便什么内容"))).not.toThrow();
    expect(() => assertFormatMatchesContent("md", Buffer.from("# 标题"))).not.toThrow();
  });
});
