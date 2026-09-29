import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { ParseError } from "@/server/parsing/errors";
import { parsePdf } from "@/server/parsing/pdf";

function fixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", name));
}

/** 每页几乎无文本的 PDF，用于扫描版判定。 */
async function blankPdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

describe("parsePdf", () => {
  it("读取文档元数据作为标题与作者", async () => {
    const parsed = await parsePdf(fixture("sample.pdf"), "sample.pdf");
    expect(parsed.title).toBe("Communication Guide");
    expect(parsed.author).toBe("Fixture Author");
  });

  it("有书签时按书签分节", async () => {
    const parsed = await parsePdf(fixture("sample.pdf"), "sample.pdf");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "Chapter 1 Listening",
      "Chapter 2 Asking",
      "Chapter 3 Closing",
    ]);
    expect(parsed.sections[0].text).toContain(
      "Listening is not silence. It means making sure the other person feels understood. Repeat the key sentence back before offering any suggestion.",
    );
    expect(parsed.sections[2].text).toContain("Always agree on a next step and a date.");
  });

  it("无书签时按标题正则分节", async () => {
    const parsed = await parsePdf(fixture("sample-no-bookmark.pdf"), "sample-no-bookmark.pdf");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "Chapter 1 Listening",
      "Chapter 2 Asking",
      "Chapter 3 Closing",
    ]);
  });

  it("每页几乎无文本时判定为扫描版并报中文错误", async () => {
    await expect(parsePdf(await blankPdf(3), "scan.pdf")).rejects.toThrow(ParseError);
    await expect(parsePdf(await blankPdf(3), "scan.pdf")).rejects.toThrow(
      "疑似扫描版 PDF，暂不支持，请先转成文字版或 txt",
    );
  });
});
