import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UPLOAD_MAX_BYTES } from "@/domain/constants";
import { methodologies, sourceChunks, sources } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import {
  deleteSource,
  getChunkText,
  getSourceDetail,
  listSources,
  setAllChunksSkipped,
  setChunkSkipped,
  uploadSource,
} from "@/server/services/sources";
import { createTestDb, type TestDb } from "../helpers/db";

const FIXTURES = join(process.cwd(), "tests/fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

let test: TestDb;
let uploadsDir: string;

beforeAll(() => {
  test = createTestDb();
  uploadsDir = mkdtempSync(join(tmpdir(), "axiom-uploads-"));
});

afterAll(() => {
  test.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

async function upload(name: string) {
  return uploadSource(
    { filename: name, buffer: fixture(name) },
    { database: test.db, uploadsDir },
  );
}

describe("uploadSource", () => {
  it("epub：写入资料与章节块，状态为 ready", async () => {
    const detail = await upload("sample.epub");
    expect(detail.title).toBe("沟通的艺术");
    expect(detail.author).toBe("测试作者");
    expect(detail.format).toBe("epub");
    expect(detail.status).toBe("ready");
    // 夹具各节都短于 CHUNK_MIN_CHARS，分块阶段会合并为一节，标题用 / 连接
    expect(detail.chunks).toHaveLength(1);
    expect(detail.chunks[0].title).toBe(
      "第一章 开场 / 第二章 倾听 / 第二节 复述 / 第三章 收尾",
    );
    expect(detail.chunks[0].extractionStatus).toBe("pending");
    expect(detail.estimatedTokens).toBeGreaterThan(0);
    expect(detail.draftCount).toBe(0);
    expect(detail.confirmedCount).toBe(0);
    // 上传文件已保存
    const row = test.db.select().from(sources).where(eq(sources.id, detail.id)).get();
    expect(row?.filePath.startsWith(uploadsDir)).toBe(true);
    expect(existsSync(row?.filePath ?? "")).toBe(true);
  });

  it("GBK txt：章节标题与正文不乱码", async () => {
    const detail = await upload("sample-gbk.txt");
    expect(detail.title).toBe("sample-gbk");
    expect(detail.chunks).toHaveLength(1);
    expect(detail.chunks[0].title).toBe("第一章 开场的话 / 第二章 认真倾听 / 第三章 收尾与跟进");
    const chunk = await getChunkText(detail.id, detail.chunks[0].id, test.db);
    expect(chunk.text).toContain("复述对方的原话是成本最低的倾听技巧");
    expect(chunk.text).not.toContain("\uFFFD");
  });

  it("markdown：去掉标记并分节", async () => {
    const detail = await upload("sample.md");
    expect(detail.title).toBe("沟通方法论笔记");
    expect(detail.chunks).toHaveLength(1);
    const chunk = await getChunkText(detail.id, detail.chunks[0].id, test.db);
    expect(chunk.text).toContain("倾听的关键是先接住情绪");
    expect(chunk.text).not.toContain("**");
  });

  it("pdf（有书签）：按书签分节", async () => {
    const detail = await upload("sample.pdf");
    expect(detail.title).toBe("Communication Guide");
    expect(detail.chunks).toHaveLength(1);
    const chunk = await getChunkText(detail.id, detail.chunks[0].id, test.db);
    expect(chunk.text).toContain("Listening is not silence.");
    expect(chunk.text).toContain("Always agree on a next step and a date.");
  });

  it("不支持的扩展名报中文错误", async () => {
    await expect(uploadSource({ filename: "a.docx", buffer: Buffer.from("x") }, { database: test.db })).rejects.toThrow(
      "只支持 epub、pdf、txt、md 格式的文件",
    );
  });

  it("魔数与扩展名不一致时报错", async () => {
    await expect(
      uploadSource({ filename: "fake.epub", buffer: fixture("sample.pdf") }, { database: test.db, uploadsDir }),
    ).rejects.toThrow("文件内容与扩展名不符");
  });

  it("空文件报错", async () => {
    await expect(
      uploadSource({ filename: "empty.txt", buffer: Buffer.alloc(0) }, { database: test.db, uploadsDir }),
    ).rejects.toThrow("文件内容为空");
  });

  it("超过大小上限报错", async () => {
    await expect(
      uploadSource(
        { filename: "big.txt", buffer: Buffer.alloc(UPLOAD_MAX_BYTES + 1) },
        { database: test.db, uploadsDir },
      ),
    ).rejects.toThrow("文件超过 50MB 上限");
  });

  it("解析失败时不落库（不产生资料行）", async () => {
    const before = test.db.select().from(sources).all().length;
    await expect(
      uploadSource({ filename: "fake.epub", buffer: Buffer.from("not a zip") }, { database: test.db, uploadsDir }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(test.db.select().from(sources).all().length).toBe(before);
  });
});

describe("getSourceDetail 与 listSources", () => {
  it("统计 draft / confirmed 数量", async () => {
    const detail = await upload("sample.md");
    const now = Date.now();
    test.db
      .insert(methodologies)
      .values([
        {
          id: "m-draft",
          sourceId: detail.id,
          status: "draft",
          name: "候选",
          body: { summary: "", goal: "", applicability: [], counterIndications: [], orderMode: "loose", steps: [], principles: [], concepts: [] },
          originChunkIds: [],
          createdBy: "manual",
          version: 1,
          createdAt: now,
          updatedAt: now,
          confirmedAt: null,
        },
        {
          id: "m-confirmed",
          sourceId: detail.id,
          status: "confirmed",
          name: "已确认",
          body: { summary: "", goal: "", applicability: [], counterIndications: [], orderMode: "loose", steps: [], principles: [], concepts: [] },
          originChunkIds: [],
          createdBy: "manual",
          version: 1,
          createdAt: now,
          updatedAt: now,
          confirmedAt: now,
        },
      ])
      .run();

    const refreshed = getSourceDetail(detail.id, test.db);
    expect(refreshed.draftCount).toBe(1);
    expect(refreshed.confirmedCount).toBe(1);

    const list = listSources(test.db);
    const item = list.find((entry) => entry.id === detail.id);
    expect(item).toMatchObject({ draftCount: 1, confirmedCount: 1, chunkCount: detail.chunks.length });
  });

  it("资料不存在返回 404", () => {
    expect(() => getSourceDetail("nope", test.db)).toThrow(ApiError);
  });
});

describe("setChunkSkipped", () => {
  it("在 skipped 与 pending 间切换", async () => {
    const detail = await upload("sample.md");
    const chunkId = detail.chunks[0].id;
    setChunkSkipped(detail.id, chunkId, true, test.db);
    expect(test.db.select().from(sourceChunks).where(eq(sourceChunks.id, chunkId)).get()?.extractionStatus).toBe("skipped");
    setChunkSkipped(detail.id, chunkId, false, test.db);
    expect(test.db.select().from(sourceChunks).where(eq(sourceChunks.id, chunkId)).get()?.extractionStatus).toBe("pending");
  });

  it("已抽取完成的章节不允许切换", async () => {
    const detail = await upload("sample.md");
    const chunkId = detail.chunks[0].id;
    test.db.update(sourceChunks).set({ extractionStatus: "done" }).where(eq(sourceChunks.id, chunkId)).run();
    expect(() => setChunkSkipped(detail.id, chunkId, true, test.db)).toThrow("该章节已经开始抽取");
  });
});

describe("setAllChunksSkipped", () => {
  /** 在已上传的资料上追加一个待抽取章节块与一个已抽取完成的章节块。 */
  async function uploadWithMixedChunks() {
    const detail = await upload("sample.md");
    const now = Date.now();
    test.db
      .insert(sourceChunks)
      .values([
        {
          id: nanoid(),
          sourceId: detail.id,
          seq: 2,
          title: "待抽取章节",
          text: "内容",
          charCount: 2,
          extractionStatus: "pending",
          extractionError: null,
          extractedAt: null,
        },
        {
          id: nanoid(),
          sourceId: detail.id,
          seq: 3,
          title: "已完成章节",
          text: "内容",
          charCount: 2,
          extractionStatus: "done",
          extractionError: null,
          extractedAt: now,
        },
      ])
      .run();
    return detail;
  }

  function statusesOf(sourceId: string) {
    return test.db
      .select()
      .from(sourceChunks)
      .where(eq(sourceChunks.sourceId, sourceId))
      .orderBy(sourceChunks.seq)
      .all()
      .map((chunk) => chunk.extractionStatus);
  }

  it("全部跳过与全部恢复，已抽取完成的章节保持原状", async () => {
    const detail = await uploadWithMixedChunks();

    expect(setAllChunksSkipped(detail.id, true, test.db)).toEqual({ updated: 2, locked: 1 });
    expect(statusesOf(detail.id)).toEqual(["skipped", "skipped", "done"]);

    expect(setAllChunksSkipped(detail.id, false, test.db)).toEqual({ updated: 2, locked: 1 });
    expect(statusesOf(detail.id)).toEqual(["pending", "pending", "done"]);
  });

  it("重复执行时没有可改动的章节，只有已抽取完成的章节计入 locked", async () => {
    const detail = await uploadWithMixedChunks();
    setAllChunksSkipped(detail.id, true, test.db);
    expect(setAllChunksSkipped(detail.id, true, test.db)).toEqual({ updated: 0, locked: 1 });
  });

  it("资料不存在返回 404", () => {
    expect(() => setAllChunksSkipped("nope", true, test.db)).toThrow(ApiError);
  });
});

describe("deleteSource", () => {
  it("删除资料、章节块、上传文件与 draft；confirmed 保留并置空 sourceId", async () => {
    const detail = await upload("sample.epub");
    const now = Date.now();
    const makeBody = () => ({ summary: "", goal: "", applicability: [], counterIndications: [], orderMode: "loose" as const, steps: [], principles: [], concepts: [] });
    test.db
      .insert(methodologies)
      .values([
        { id: "del-draft", sourceId: detail.id, status: "draft", name: "要删", body: makeBody(), originChunkIds: [], createdBy: "manual", version: 1, createdAt: now, updatedAt: now, confirmedAt: null },
        { id: "keep-confirmed", sourceId: detail.id, status: "confirmed", name: "要留", body: makeBody(), originChunkIds: [], createdBy: "manual", version: 1, createdAt: now, updatedAt: now, confirmedAt: now },
      ])
      .run();
    const filePath = test.db.select().from(sources).where(eq(sources.id, detail.id)).get()?.filePath ?? "";

    await deleteSource(detail.id, { database: test.db, uploadsDir });

    expect(test.db.select().from(sources).where(eq(sources.id, detail.id)).get()).toBeUndefined();
    expect(test.db.select().from(sourceChunks).where(eq(sourceChunks.sourceId, detail.id)).all()).toHaveLength(0);
    expect(test.db.select().from(methodologies).where(eq(methodologies.id, "del-draft")).get()).toBeUndefined();
    const kept = test.db.select().from(methodologies).where(eq(methodologies.id, "keep-confirmed")).get();
    expect(kept?.sourceId).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });
});
