import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildChunks, splitByMaxChars } from "@/server/parsing/chunk";
import { CHUNK_MAX_CHARS } from "@/domain/constants";

function fixture(name: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", name));
}

describe("buildChunks", () => {
  it("去掉空节并重新编号", () => {
    const chunks = buildChunks([
      { title: "一", text: "  " },
      { title: "二", text: "x".repeat(1600) },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].seq).toBe(1);
  });

  it("标题命中目录/版权等关键词时标记为跳过", () => {
    const chunks = buildChunks([
      { title: "目录", text: "第一章……" },
      { title: "Copyright", text: "All rights reserved." },
      { title: "第一章 开场", text: "x".repeat(1600) },
    ]);
    expect(chunks.map((chunk) => chunk.skipped)).toEqual([true, true, false]);
    expect(chunks.map((chunk) => chunk.seq)).toEqual([1, 2, 3]);
  });

  it("合并过短的节，标题用 A / B 连接", () => {
    const chunks = buildChunks([
      { title: "第一节", text: "很短" },
      { title: "第二节", text: "x".repeat(1600) },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("第一节 / 第二节");
    expect(chunks[0].text.startsWith("很短")).toBe(true);
    expect(chunks[0].text).toContain("x".repeat(100));
  });

  it("末尾过短的节并入前一节", () => {
    const chunks = buildChunks([
      { title: "第一节", text: "x".repeat(1600) },
      { title: "第二节", text: "很短" },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("第一节 / 第二节");
    expect(chunks[0].text.endsWith("很短")).toBe(true);
  });

  it("跳过标记的节不参与合并", () => {
    const chunks = buildChunks([
      { title: "版权", text: "版权信息" },
      { title: "第一节", text: "x".repeat(1600) },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ title: "版权", skipped: true, seq: 1 });
    expect(chunks[1]).toMatchObject({ title: "第一节", skipped: false, seq: 2 });
  });

  it("过长的节按段落切分，标题带（i/n）", () => {
    const total = 25000;
    const chunks = buildChunks([{ title: "长节", text: "x".repeat(total) }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].title).toBe(`长节（1/${chunks.length}）`);
    expect(chunks.at(-1)?.title).toBe(`长节（${chunks.length}/${chunks.length}）`);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
    expect(chunks.map((chunk) => chunk.text).join("").length).toBe(total);
  });

  it("切分后的序号连续", () => {
    const chunks = buildChunks([
      { title: "目录", text: "目录内容" },
      { title: "长节", text: "x".repeat(25000) },
    ]);
    expect(chunks.map((chunk) => chunk.seq)).toEqual(chunks.map((_, index) => index + 1));
  });
});

describe("splitByMaxChars", () => {
  it("按段落边界尽量均匀切分，每份不超上限", () => {
    const paragraph = "x".repeat(12000);
    const parts = splitByMaxChars([paragraph, paragraph, paragraph].join("\n\n"));
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it("不超上限时不切分", () => {
    expect(splitByMaxChars("短文本")).toEqual(["短文本"]);
  });

  it("单个超长段落也会被强制切分", () => {
    const parts = splitByMaxChars("y".repeat(45000));
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });
});

describe("夹具与分块的配合", () => {
  it("读取夹具文件不报错（占位，确保 fixtures 已提交）", () => {
    expect(fixture("sample.md").length).toBeGreaterThan(0);
  });
});
