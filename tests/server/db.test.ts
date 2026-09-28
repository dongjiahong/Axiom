import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createTestDb } from "../helpers/db";
import { methodologies, practiceSessions, scenarios, sourceChunks, sources } from "@/server/db/schema";
import { makeMethodologyBody } from "../fixtures/methodology";

describe("测试基座 createTestDb", () => {
  it("返回迁移完成的内存数据库，可读写 JSON 列", () => {
    const { db, close } = createTestDb();
    const now = Date.now();
    db.insert(methodologies)
      .values({
        id: "m1",
        sourceId: null,
        status: "draft",
        name: "向领导提加薪",
        body: makeMethodologyBody({ orderMode: "strict" }),
        originChunkIds: [],
        createdBy: "seed",
        mergedIntoId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        confirmedAt: null,
      })
      .run();

    const row = db.select().from(methodologies).all();
    expect(row).toHaveLength(1);
    expect(row[0].body.orderMode).toBe("strict");
    expect(row[0].originChunkIds).toEqual([]);
    close();
  });

  it("开启外键：引用不存在的资料时报错", () => {
    const { db, close } = createTestDb();
    expect(() =>
      db
        .insert(sourceChunks)
        .values({
          id: "c1",
          sourceId: "missing",
          seq: 1,
          title: "第一章",
          text: "正文",
          charCount: 2,
          extractionStatus: "pending",
          extractionError: null,
          extractedAt: null,
        })
        .run(),
    ).toThrow(/FOREIGN KEY/i);
    close();
  });

  it("级联删除：删除资料会删除其章节块", () => {
    const { db, close } = createTestDb();
    const now = Date.now();
    db.insert(sources)
      .values({
        id: "s1",
        title: "沟通的方法",
        author: "脱不花",
        format: "epub",
        originalFilename: "a.epub",
        filePath: "data/uploads/s1.epub",
        charCount: 100,
        status: "ready",
        error: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(sourceChunks)
      .values({
        id: "c1",
        sourceId: "s1",
        seq: 1,
        title: "第一章",
        text: "正文",
        charCount: 2,
        extractionStatus: "pending",
        extractionError: null,
        extractedAt: null,
      })
      .run();

    db.delete(sources).where(eq(sources.id, "s1")).run();
    expect(db.select().from(sourceChunks).all()).toHaveLength(0);
    close();
  });

  it("unique(sessionId, seq) 生效", () => {
    const { db, close } = createTestDb();
    const now = Date.now();
    db.insert(methodologies)
      .values({
        id: "m1",
        sourceId: null,
        status: "confirmed",
        name: "结论先行的工作汇报",
        body: makeMethodologyBody(),
        originChunkIds: [],
        createdBy: "seed",
        mergedIntoId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      })
      .run();
    db.insert(scenarios)
      .values({
        id: "sc1",
        targetMethodologyId: "m1",
        targetVersion: 1,
        difficulty: "neutral",
        scope: { tagIds: [], sourceIds: [], methodologyIds: [] },
        candidateIds: ["m1"],
        title: "标题",
        background: "背景",
        userRole: "你",
        userGoal: "目标",
        counterpartName: "李经理",
        counterpartRelation: "直属上级",
        counterpartProfile: "公开人设",
        openingSpeaker: "counterpart",
        openingLine: "找我什么事？",
        brief: {
          personality: "强势",
          trueStance: "暂不同意",
          hiddenConcerns: ["预算紧张"],
          plannedResistance: [],
          yieldConditions: "拿出数据",
          breakdownConditions: "情绪化",
        },
        alternatives: [],
        designNotes: "设计说明",
        promptVersion: "scenario@1",
        createdAt: now,
      })
      .run();
    db.insert(practiceSessions)
      .values({
        id: "p1",
        scenarioId: "sc1",
        mode: "drill",
        status: "briefing",
        selectedMethodologyId: "m1",
        targetSnapshot: null,
        selectedSnapshot: null,
        hintUsed: false,
        maxTurns: 12,
        endReason: null,
        endNote: null,
        createdAt: now,
        startedAt: null,
        endedAt: null,
      })
      .run();
    close();
  });
});
