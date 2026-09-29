import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEpub } from "@/server/parsing/epub";

function fixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", name));
}

describe("parseEpub", () => {
  it("读取 OPF 元数据作为标题与作者", async () => {
    const parsed = await parseEpub(fixture("sample.epub"), "sample.epub");
    expect(parsed.title).toBe("沟通的艺术");
    expect(parsed.author).toBe("测试作者");
  });

  it("按 nav 目录分节，含第二层条目", async () => {
    const parsed = await parseEpub(fixture("sample.epub"), "sample.epub");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "第一章 开场",
      "第二章 倾听",
      "第二节 复述",
      "第三章 收尾",
    ]);
  });

  it("分节使用锚点，第二节不含章标题的正文", async () => {
    const parsed = await parseEpub(fixture("sample.epub"), "sample.epub");
    const first = parsed.sections.find((section) => section.title === "第一章 开场");
    expect(first?.text).toContain("开场的目的是让对方愿意继续谈下去。");

    const nested = parsed.sections.find((section) => section.title === "第二节 复述");
    expect(nested?.text).toContain("复述的句式很固定");
    expect(nested?.text).not.toContain("倾听不是沉默");

    const last = parsed.sections.at(-1);
    expect(last?.title).toBe("第三章 收尾");
    expect(last?.text).toContain("通常不会有结果。");
  });

  it("没有目录时每个 spine 文件一节，标题取首个 h1–h3", async () => {
    const parsed = await parseEpub(fixture("sample-no-toc.epub"), "sample-no-toc.epub");
    expect(parsed.sections.map((section) => section.title)).toEqual([
      "第一章 开场",
      "第二章 倾听",
      "第三章 收尾",
    ]);
    expect(parsed.sections[0].text).toContain("开场的目的是让对方愿意继续谈下去。");
    // 没有目录时第二节仍包含整章内容
    expect(parsed.sections[1].text).toContain("复述的句式很固定");
  });

  it("没有标题也没有目录时用第 N 部分兜底", async () => {
    // sample-no-toc.epub 的 h1 就是章标题，这里用构造的最小 epub 验证兜底
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    );
    zip.file(
      "content.opf",
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>无标题书</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>`,
    );
    zip.file(
      "a.xhtml",
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><div>没有标题的正文。</div></body></html>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const parsed = await parseEpub(buffer, "无标题书.epub");
    expect(parsed.title).toBe("无标题书");
    expect(parsed.sections).toEqual([{ title: "第 1 部分", text: "没有标题的正文。" }]);
  });
});
