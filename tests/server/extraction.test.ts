import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  jobs,
  mergeSuggestions,
  methodologies,
  methodologyTags,
  sourceChunks,
  sources,
  tags,
} from "@/server/db/schema";
import { ApiError } from "@/server/http";
import {
  createExtractSourceHandler,
  defaultExtractTasks,
  type ExtractTasks,
} from "@/server/jobs/extract-source";
import { JobRunner } from "@/server/jobs/runner";
import {
  cancelJob,
  getJob,
  listMergeSuggestions,
  listSourceDrafts,
  retryFailedChunks,
  startExtraction,
} from "@/server/services/extraction";

import { createTestDb, type TestDb } from "../helpers/db";
import { withFakeLLM } from "../helpers/llm";

let test: TestDb;
let restore: () => void;

beforeAll(() => {
  restore = withFakeLLM();
  test = createTestDb();
});

afterAll(() => {
  test.close();
  restore();
});

beforeEach(() => {
  test.db.delete(mergeSuggestions).run();
  test.db.delete(methodologies).run();
  test.db.delete(tags).run();
  test.db.delete(jobs).run();
  test.db.delete(sources).run();
});

function chunkText(seed: string): string {
  return `${seed}。${"先准备好数据，再选择合适的时机沟通。".repeat(20)}`;
}

function makeSource(chunkDefs: { title: string; text: string; status?: "pending" | "skipped" }[]) {
  const sourceId = nanoid();
  const now = Date.now();
  test.db
    .insert(sources)
    .values({
      id: sourceId,
      title: "测试书",
      author: "作者",
      format: "txt",
      originalFilename: "book.txt",
      filePath: "/tmp/none",
      charCount: 1000,
      status: "ready",
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const chunkIds = chunkDefs.map((def, i) => {
    const id = nanoid();
    test.db
      .insert(sourceChunks)
      .values({
        id,
        sourceId,
        seq: i + 1,
        title: def.title,
        text: def.text,
        charCount: def.text.length,
        extractionStatus: def.status ?? "pending",
        extractionError: null,
        extractedAt: null,
      })
      .run();
    return id;
  });
  return { sourceId, chunkIds };
}

function makeRunner(tasks: ExtractTasks = defaultExtractTasks) {
  return new JobRunner({
    database: test.db,
    handlers: { extract_source: createExtractSourceHandler(tasks) },
  });
}

async function extract(sourceId: string, runner: JobRunner) {
  const job = startExtraction(sourceId, { database: test.db, runner });
  await runner.whenIdle();
  return getJob(job.id, { database: test.db });
}

function chunkStatuses(sourceId: string) {
  return test.db
    .select()
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId))
    .orderBy(sourceChunks.seq)
    .all()
    .map((c) => c.extractionStatus);
}

function sourceStatus(sourceId: string) {
  return test.db.select().from(sources).where(eq(sources.id, sourceId)).get()!.status;
}

describe("抽取流水线（Fake LLM）", () => {
  it("每个非空章节块产生 draft，摘录全部为 exact，资料变为已抽取", async () => {
    const { sourceId, chunkIds } = makeSource([
      { title: "第一章 开场", text: chunkText("开场的方法") },
      { title: "第二章 倾听", text: chunkText("倾听的方法") },
    ]);
    const job = await extract(sourceId, makeRunner());

    expect(job).toMatchObject({ status: "succeeded", stage: "done", progressDone: 2, progressTotal: 2 });
    expect(chunkStatuses(sourceId)).toEqual(["done", "done"]);
    expect(sourceStatus(sourceId)).toBe("extracted");

    const rows = test.db.select().from(methodologies).all();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ status: "draft", createdBy: "extraction", sourceId });
      expect(chunkIds).toContain(row.originChunkIds[0]);
      const nodes = [...row.body.steps, ...row.body.steps.flatMap((s) => s.keyPoints)];
      for (const node of nodes) {
        expect(node.excerpt).toMatchObject({ match: "exact", chunkId: row.originChunkIds[0] });
      }
      expect(row.body.applicability[0]).toMatchObject({ inferred: true, excerpt: null });
    }
    // 标签按名称建立并关联
    expect(test.db.select().from(tags).all().map((t) => t.name)).toEqual(["职场"]);
    expect(test.db.select().from(methodologyTags).all()).toHaveLength(2);
  });

  it("过短的章节块完成但不产生 draft；已跳过的块不处理", async () => {
    const { sourceId } = makeSource([
      { title: "前言", text: "很短的一段。" },
      { title: "跳过的章", text: chunkText("跳过"), status: "skipped" },
      { title: "正文", text: chunkText("正文的方法") },
    ]);
    const job = await extract(sourceId, makeRunner());
    expect(chunkStatuses(sourceId)).toEqual(["done", "skipped", "done"]);
    expect(job).toMatchObject({ progressDone: 2, progressTotal: 2 });
    expect(test.db.select().from(methodologies).all()).toHaveLength(1);
  });

  it("重复抽取同一块不会产生重复 draft", async () => {
    const { sourceId, chunkIds } = makeSource([{ title: "第一章", text: chunkText("开场") }]);
    const runner = makeRunner();
    await extract(sourceId, runner);
    test.db
      .update(sourceChunks)
      .set({ extractionStatus: "pending" })
      .where(eq(sourceChunks.id, chunkIds[0]))
      .run();
    await extract(sourceId, runner);
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(1);
  });

  it("重试不会删除已确认的方法论", async () => {
    const { sourceId, chunkIds } = makeSource([{ title: "第一章", text: chunkText("开场") }]);
    const runner = makeRunner();
    await extract(sourceId, runner);
    test.db.update(methodologies).set({ status: "confirmed" }).run();
    test.db
      .update(sourceChunks)
      .set({ extractionStatus: "pending" })
      .where(eq(sourceChunks.id, chunkIds[0]))
      .run();
    await extract(sourceId, runner);
    const statuses = test.db.select().from(methodologies).all().map((m) => m.status).sort();
    expect(statuses).toEqual(["confirmed", "draft"]);
  });

  it("名称相同的 draft 被自动合并，原 draft 归档", async () => {
    const { sourceId, chunkIds } = makeSource([
      { title: "同名章节", text: chunkText("第一处讲述") },
      { title: "同名章节", text: chunkText("第二处讲述") },
    ]);
    const job = await extract(sourceId, makeRunner());
    expect(job.status).toBe("succeeded");

    const rows = test.db.select().from(methodologies).all();
    const merged = rows.filter((m) => m.createdBy === "merge");
    const archived = rows.filter((m) => m.status === "archived");
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("draft");
    expect(merged[0].originChunkIds.sort()).toEqual([...chunkIds].sort());
    expect(archived).toHaveLength(2);
    expect(archived.every((m) => m.mergedIntoId === merged[0].id)).toBe(true);
    // 合并后摘录在两个章节块的并集中重新核对
    expect(merged[0].body.steps[0].excerpt?.match).toBe("exact");
    expect(listSourceDrafts(sourceId, test.db).map((d) => d.id)).toEqual([merged[0].id]);
    expect(test.db.select().from(mergeSuggestions).all()).toHaveLength(0);
  });

  it("没有可抽取的章节块时拒绝入队", () => {
    const { sourceId } = makeSource([{ title: "跳过", text: chunkText("x"), status: "skipped" }]);
    expect(() => startExtraction(sourceId, { database: test.db, runner: makeRunner() })).toThrow(
      ApiError,
    );
  });

  it("已有进行中的任务时返回 409", async () => {
    const { sourceId } = makeSource([{ title: "第一章", text: chunkText("开场") }]);
    const runner = makeRunner();
    startExtraction(sourceId, { database: test.db, runner });
    try {
      startExtraction(sourceId, { database: test.db, runner });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
    }
    await runner.whenIdle();
  });
});

describe("合并建议", () => {
  const stubCluster: ExtractTasks["cluster"] = async (input) => ({
    groups: [
      {
        refs: input.items.map((i) => i.ref),
        confidence: "medium",
        reason: "适用情境略有差异",
      },
    ],
  });

  it("medium 组生成合并建议，成员保持 draft", async () => {
    const { sourceId } = makeSource([
      { title: "章节甲", text: chunkText("甲") },
      { title: "章节乙", text: chunkText("乙") },
    ]);
    await extract(sourceId, makeRunner({ ...defaultExtractTasks, cluster: stubCluster }));

    const suggestions = listMergeSuggestions(sourceId, test.db);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reason).toBe("适用情境略有差异");
    expect(suggestions[0].members).toHaveLength(2);
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(2);
  });

  it("成员相同的建议不会重复创建", async () => {
    const { sourceId, chunkIds } = makeSource([
      { title: "章节甲", text: chunkText("甲") },
      { title: "章节乙", text: chunkText("乙") },
    ]);
    const runner = makeRunner({ ...defaultExtractTasks, cluster: stubCluster });
    await extract(sourceId, runner);
    test.db.update(sourceChunks).set({ extractionStatus: "pending" }).where(eq(sourceChunks.id, chunkIds[0])).run();
    // 重新抽取第一块会删除并重建它的 draft，原建议因成员消失而过期，新建议成员不同
    await extract(sourceId, runner);
    const open = listMergeSuggestions(sourceId, test.db);
    expect(open).toHaveLength(1);
    expect(open[0].members).toHaveLength(2);
  });

  it("高置信组自动合并失败时降级为合并建议", async () => {
    const { sourceId } = makeSource([
      { title: "同名章节", text: chunkText("甲") },
      { title: "同名章节", text: chunkText("乙") },
    ]);
    const job = await extract(
      sourceId,
      makeRunner({
        ...defaultExtractTasks,
        merge: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(job.status).toBe("succeeded");
    const suggestions = listMergeSuggestions(sourceId, test.db);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reason).toContain("自动合并失败");
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(2);
  });
});

describe("失败与取消", () => {
  it("某个块始终抛错：该块 failed，其余正常，任务仍完成", async () => {
    const { sourceId, chunkIds } = makeSource([
      { title: "好的章", text: chunkText("好") },
      { title: "坏的章", text: chunkText("坏") },
      { title: "另一个好章", text: chunkText("另一个好") },
    ]);
    const runner = makeRunner({
      ...defaultExtractTasks,
      extractChunk: async (input, ctx) => {
        if (input.chunkTitle === "坏的章") throw new Error("模型炸了");
        return defaultExtractTasks.extractChunk(input, ctx);
      },
    });
    const job = await extract(sourceId, runner);

    expect(job).toMatchObject({ status: "succeeded", progressDone: 2, progressTotal: 3 });
    expect(chunkStatuses(sourceId)).toEqual(["done", "failed", "done"]);
    const failed = test.db.select().from(sourceChunks).where(eq(sourceChunks.id, chunkIds[1])).get()!;
    expect(failed.extractionError).toBeTruthy();
    expect(sourceStatus(sourceId)).toBe("extracted");
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(2);

    // 重试失败章节：只有失败块被重新处理
    const healthy = makeRunner();
    const retried = retryFailedChunks(sourceId, { database: test.db, runner: healthy });
    await healthy.whenIdle();
    expect(getJob(retried.id, { database: test.db }).status).toBe("succeeded");
    expect(chunkStatuses(sourceId)).toEqual(["done", "done", "done"]);
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(3);
  });

  it("没有失败块时不能重试", () => {
    const { sourceId } = makeSource([{ title: "第一章", text: chunkText("开场") }]);
    expect(() => retryFailedChunks(sourceId, { database: test.db, runner: makeRunner() })).toThrow(
      "没有失败的章节块",
    );
  });

  it("处理中取消：job 为 cancelled，未处理块为 pending，再次入队可继续", async () => {
    const { sourceId } = makeSource([
      { title: "章一", text: chunkText("一") },
      { title: "章二", text: chunkText("二") },
      { title: "章三", text: chunkText("三") },
      { title: "章四", text: chunkText("四") },
    ]);
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => (started = resolve));
    const blocking: ExtractTasks = {
      ...defaultExtractTasks,
      extractChunk: (_input, ctx) =>
        new Promise((_resolve, reject) => {
          started();
          ctx.signal?.addEventListener("abort", () => reject(new DOMException("已中止", "AbortError")));
        }),
    };
    const runner = makeRunner(blocking);
    const job = startExtraction(sourceId, { database: test.db, runner });
    await firstStarted;
    cancelJob(job.id, { database: test.db, runner });
    await runner.whenIdle();

    expect(getJob(job.id, { database: test.db }).status).toBe("cancelled");
    expect(chunkStatuses(sourceId)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(sourceStatus(sourceId)).toBe("ready");
    expect(listSourceDrafts(sourceId, test.db)).toHaveLength(0);

    const again = await extract(sourceId, makeRunner());
    expect(again.status).toBe("succeeded");
    expect(chunkStatuses(sourceId)).toEqual(["done", "done", "done", "done"]);
  });

  it("排队中的任务可以直接取消", () => {
    const { sourceId } = makeSource([{ title: "第一章", text: chunkText("开场") }]);
    const runner = new JobRunner({ database: test.db, handlers: {} });
    const row = test.db
      .insert(jobs)
      .values({
        id: "queued-job",
        type: "extract_source",
        payload: { sourceId },
        status: "queued",
        stage: null,
        progressDone: 0,
        progressTotal: 0,
        error: null,
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      })
      .returning()
      .get();
    expect(cancelJob(row.id, { database: test.db, runner }).status).toBe("cancelled");
    expect(() => cancelJob(row.id, { database: test.db, runner })).toThrow("任务已经结束");
  });
});

describe("重启恢复", () => {
  it("running 的 job 回到队列并继续执行，running 的章节块回到 pending", async () => {
    const { sourceId, chunkIds } = makeSource([
      { title: "章一", text: chunkText("一") },
      { title: "章二", text: chunkText("二") },
    ]);
    test.db
      .update(sourceChunks)
      .set({ extractionStatus: "running" })
      .where(eq(sourceChunks.id, chunkIds[0]))
      .run();
    test.db
      .insert(jobs)
      .values({
        id: "interrupted",
        type: "extract_source",
        payload: { sourceId },
        status: "running",
        stage: "chunks",
        progressDone: 0,
        progressTotal: 2,
        error: null,
        createdAt: Date.now(),
        startedAt: Date.now(),
        finishedAt: null,
      })
      .run();

    const runner = makeRunner();
    runner.recover();
    await runner.whenIdle();

    expect(getJob("interrupted", { database: test.db })).toMatchObject({
      status: "succeeded",
      progressDone: 2,
    });
    expect(chunkStatuses(sourceId)).toEqual(["done", "done"]);
  });
});
