import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MethodologyBody } from "@/domain/schemas";
import {
  mergeSuggestions,
  methodologies,
  methodologyTags,
  sourceChunks,
  sources,
  tags,
  type MethodologyStatus,
} from "@/server/db/schema";
import type { MethodologyBodyInput } from "@/server/dto/methodology";
import { ApiError } from "@/server/http";
import { listMergeSuggestions } from "@/server/services/extraction";
import {
  acceptMergeSuggestion,
  changeMethodologyStatus,
  collectConfirmIssues,
  createBlankMethodology,
  dismissMergeSuggestion,
  getMethodology,
  listMethodologies,
  mergeMethodologies,
  saveMethodology,
  splitMethodology,
} from "@/server/services/methodologies";
import { listTags } from "@/server/services/tags";

import { makeKeyPoint, makeMethodologyBody, makeStep } from "../fixtures/methodology";
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
  test.db.delete(sources).run();
});

function addMethodology(
  overrides: Partial<{
    id: string;
    name: string;
    status: MethodologyStatus;
    body: MethodologyBody;
    sourceId: string | null;
    originChunkIds: string[];
    tagNames: string[];
    version: number;
  }> = {},
): string {
  const id = overrides.id ?? nanoid();
  const now = Date.now();
  test.db
    .insert(methodologies)
    .values({
      id,
      sourceId: overrides.sourceId ?? null,
      status: overrides.status ?? "draft",
      name: overrides.name ?? "向领导提加薪",
      body: overrides.body ?? makeMethodologyBody(),
      originChunkIds: overrides.originChunkIds ?? [],
      createdBy: "manual",
      version: overrides.version ?? 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: overrides.status === "confirmed" ? now : null,
    })
    .run();
  for (const name of overrides.tagNames ?? []) {
    let tag = test.db.select().from(tags).where(eq(tags.name, name)).get();
    if (!tag) {
      tag = { id: nanoid(), name };
      test.db.insert(tags).values(tag).run();
    }
    test.db.insert(methodologyTags).values({ methodologyId: id, tagId: tag.id }).run();
  }
  return id;
}

function addSource(chunkTexts: string[]): { sourceId: string; chunkIds: string[] } {
  const sourceId = nanoid();
  const now = Date.now();
  test.db
    .insert(sources)
    .values({
      id: sourceId,
      title: "测试书",
      author: null,
      format: "txt",
      originalFilename: "book.txt",
      filePath: "/tmp/none",
      charCount: 100,
      status: "extracted",
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const chunkIds = chunkTexts.map((text, i) => {
    const id = nanoid();
    test.db
      .insert(sourceChunks)
      .values({
        id,
        sourceId,
        seq: i + 1,
        title: `第 ${i + 1} 章`,
        text,
        charCount: text.length,
        extractionStatus: "done",
        extractionError: null,
        extractedAt: now,
      })
      .run();
    return id;
  });
  return { sourceId, chunkIds };
}

/** 把已入库方法论的正文转成保存入参（保留全部 id）。 */
function toInput(body: MethodologyBody): MethodologyBodyInput {
  return structuredClone(body);
}

function statusOf(id: string): MethodologyStatus {
  return test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!.status;
}

function expectApiError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return err as ApiError;
  }
  throw new Error("预期抛出 ApiError，但没有抛出");
}

async function expectApiErrorAsync(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return err as ApiError;
  }
  throw new Error("预期抛出 ApiError，但没有抛出");
}

describe("状态迁移", () => {
  it("合法迁移：draft → confirmed → draft → archived → draft", () => {
    const id = addMethodology();
    expect(changeMethodologyStatus(id, "confirm", test.db)).toMatchObject({ status: "confirmed" });
    expect(getMethodology(id, test.db).confirmedAt).not.toBeNull();
    expect(changeMethodologyStatus(id, "unconfirm", test.db)).toMatchObject({
      status: "draft",
      confirmedAt: null,
    });
    expect(changeMethodologyStatus(id, "archive", test.db).status).toBe("archived");
    expect(changeMethodologyStatus(id, "restore", test.db).status).toBe("draft");
  });

  it("已确认的可以直接归档", () => {
    const id = addMethodology({ status: "confirmed" });
    expect(changeMethodologyStatus(id, "archive", test.db).status).toBe("archived");
  });

  it.each([
    ["draft", "unconfirm"],
    ["draft", "restore"],
    ["confirmed", "confirm"],
    ["confirmed", "restore"],
    ["archived", "confirm"],
    ["archived", "unconfirm"],
    ["archived", "archive"],
  ] as const)("非法迁移 %s → %s 返回 409", (status, action) => {
    const id = addMethodology({ status });
    expectApiError(() => changeMethodologyStatus(id, action, test.db), 409);
    expect(statusOf(id)).toBe(status);
  });

  it("方法论不存在返回 404", () => {
    expectApiError(() => changeMethodologyStatus("nope", "confirm", test.db), 404);
  });

  it("确认校验失败返回 400，并列出所有问题", () => {
    const id = addMethodology({
      name: "  ",
      body: makeMethodologyBody({
        applicability: [],
        steps: [makeStep({ conditional: true, trigger: null }), makeStep({ keyPoints: [] })],
      }),
    });
    const err = expectApiError(() => changeMethodologyStatus(id, "confirm", test.db), 400);
    const paths = err.issues!.map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining(["name", "applicability", "steps[0].trigger", "steps[1].keyPoints"]),
    );
    expect(err.issues!.length).toBeGreaterThanOrEqual(4);
    expect(statusOf(id)).toBe("draft");
  });

  it("确认校验也检查步骤标题、要点文本不能为空（MethodologyBody 严格校验）", () => {
    const body = makeMethodologyBody({
      steps: [makeStep({ title: "", keyPoints: [makeKeyPoint("")] })],
    });
    const issues = collectConfirmIssues("名称", body);
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["steps[0].title", "steps[0].keyPoints[0].text"]),
    );
  });
});

describe("保存", () => {
  it("已确认方法论保存后 version+1，draft 不变", () => {
    const confirmedId = addMethodology({ status: "confirmed", version: 3 });
    const body = getMethodology(confirmedId, test.db).body;
    const saved = saveMethodology(confirmedId, { name: "新名字", tags: [], body: toInput(body) }, { database: test.db });
    expect(saved).toMatchObject({ name: "新名字", version: 4, status: "confirmed" });

    const draftId = addMethodology();
    const draftSaved = saveMethodology(
      draftId,
      { name: "草稿", tags: [], body: toInput(getMethodology(draftId, test.db).body) },
      { database: test.db },
    );
    expect(draftSaved.version).toBe(1);
  });

  it("新节点补上 ID，已存在节点 ID 不变", () => {
    const id = addMethodology();
    const before = getMethodology(id, test.db).body;
    const input = toInput(before);
    input.steps.push({
      excerpt: null,
      inferred: false,
      title: "新步骤",
      description: "",
      conditional: false,
      trigger: null,
      keyPoints: [{ excerpt: null, inferred: false, text: "新要点" }],
      exampleLines: [],
      commonMistakes: [],
    });
    input.principles.push({ excerpt: null, inferred: false, kind: "dont", text: "不威胁" });

    const after = saveMethodology(id, { name: "名", tags: [], body: input }, { database: test.db }).body;
    expect(after.steps[0].id).toBe(before.steps[0].id);
    expect(after.steps[0].keyPoints[0].id).toBe(before.steps[0].keyPoints[0].id);
    expect(after.applicability[0].id).toBe(before.applicability[0].id);
    expect(after.steps[1].id).toBeTruthy();
    expect(after.steps[1].keyPoints[0].id).toBeTruthy();
    expect(after.principles[0].id).toBeTruthy();
    const ids = [after.steps[1].id, after.steps[0].id, after.steps[1].keyPoints[0].id, after.principles[0].id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("重复的节点 ID 会被重新分配；概念中失效的步骤引用被移除", () => {
    const id = addMethodology();
    const body = getMethodology(id, test.db).body;
    const input = toInput(body);
    input.steps.push({ ...structuredClone(input.steps[0]) });
    input.concepts.push({
      excerpt: null,
      inferred: false,
      name: "锚定效应",
      explanation: "",
      relatedStepIds: [body.steps[0].id, "不存在"],
    });
    const after = saveMethodology(id, { name: "名", tags: [], body: input }, { database: test.db }).body;
    expect(after.steps[1].id).not.toBe(after.steps[0].id);
    expect(after.concepts[0].relatedStepIds).toEqual([body.steps[0].id]);
  });

  it("标签自动创建并整体替换", () => {
    const id = addMethodology({ tagNames: ["旧标签"] });
    const body = toInput(getMethodology(id, test.db).body);
    const saved = saveMethodology(id, { name: "名", tags: ["职场", " 亲密 关系 ", "职场"], body }, { database: test.db });
    expect(saved.tags).toEqual(["亲密关系", "职场"]);
    expect(listTags(test.db).map((t) => t.name)).toEqual(expect.arrayContaining(["旧标签", "职场", "亲密关系"]));
  });

  it("草稿允许保存空文本，确认时才校验", () => {
    const blank = createBlankMethodology(test.db);
    expect(blank).toMatchObject({ status: "draft", createdBy: "manual", sourceId: null });
    expect(blank.body.steps).toHaveLength(1);
    expect(blank.body.steps[0].keyPoints).toHaveLength(1);

    saveMethodology(blank.id, { name: "半成品", tags: [], body: toInput(blank.body) }, { database: test.db });
    expectApiError(() => changeMethodologyStatus(blank.id, "confirm", test.db), 400);
  });

  it("已确认的方法论保存前必须通过确认校验，失败时不改动", () => {
    const id = addMethodology({ status: "confirmed", version: 2 });
    const input = toInput(getMethodology(id, test.db).body);
    input.applicability = [];
    const err = expectApiError(
      () => saveMethodology(id, { name: "改名", tags: [], body: input }, { database: test.db }),
      400,
    );
    expect(err.issues!.map((i) => i.path)).toContain("applicability");
    expect(getMethodology(id, test.db)).toMatchObject({ name: "向领导提加薪", version: 2 });
  });

  it("已归档的方法论不能保存", () => {
    const id = addMethodology({ status: "archived" });
    const input = toInput(getMethodology(id, test.db).body);
    expectApiError(() => saveMethodology(id, { name: "x", tags: [], body: input }, { database: test.db }), 409);
  });
});

describe("拆分", () => {
  function bodyWithSteps() {
    const a = makeStep({ title: "A" });
    const b = makeStep({ title: "B" });
    const c = makeStep({ title: "C 条件", conditional: true, trigger: "对方拒绝" });
    const body = makeMethodologyBody({
      steps: [a, b, c],
      principles: [{ id: nanoid(), excerpt: null, inferred: true, kind: "do", text: "保持礼貌" }],
      concepts: [
        { id: nanoid(), excerpt: null, inferred: true, name: "锚定", explanation: "x", relatedStepIds: [a.id, c.id] },
      ],
    });
    return { body, a, b, c };
  }

  it("新旧方法论的步骤划分正确", () => {
    const { body, a, b, c } = bodyWithSteps();
    const id = addMethodology({ body, tagNames: ["职场"], sourceId: null, originChunkIds: ["chunk-1"] });

    const created = splitMethodology(id, [b.id, c.id], test.db);
    expect(created).toMatchObject({
      name: "向领导提加薪（拆分）",
      status: "draft",
      createdBy: "split",
      tags: ["职场"],
    });
    expect(created.body.steps.map((s) => s.title)).toEqual(["B", "C 条件"]);
    expect(created.body.principles.map((p) => p.text)).toEqual(["保持礼貌"]);
    expect(created.body.applicability.map((p) => p.text)).toEqual(["适用条件"]);
    // 新方法论的节点使用新 ID，概念关联的步骤随之映射到新步骤
    expect(created.body.steps[0].id).not.toBe(b.id);
    expect(created.body.concepts[0].relatedStepIds).toEqual([created.body.steps[1].id]);

    const original = getMethodology(id, test.db);
    expect(original.body.steps.map((s) => s.id)).toEqual([a.id]);
    expect(original.body.concepts[0].relatedStepIds).toEqual([a.id]);
    expect(original.body.principles).toHaveLength(1);
  });

  it("拆完原方法论没有非条件步骤时拒绝，且不改动", () => {
    const { body, a, b } = bodyWithSteps();
    const id = addMethodology({ body });
    expectApiError(() => splitMethodology(id, [a.id, b.id], test.db), 400);
    expect(getMethodology(id, test.db).body.steps).toHaveLength(3);
    expect(listMethodologies({}, test.db)).toHaveLength(1);
  });

  it("步骤不存在返回 400；非 draft 返回 409", () => {
    const { body, a } = bodyWithSteps();
    const id = addMethodology({ body });
    expectApiError(() => splitMethodology(id, ["nope"], test.db), 400);
    expectApiError(() => splitMethodology(id, [], test.db), 400);
    changeMethodologyStatus(id, "confirm", test.db);
    expectApiError(() => splitMethodology(id, [a.id], test.db), 409);
  });
});

describe("合并", () => {
  it("原 draft 归档且 mergedIntoId 正确，标签取并集", async () => {
    const one = addMethodology({ name: "加薪 A", tagNames: ["职场"] });
    const two = addMethodology({ name: "加薪 B", tagNames: ["谈判"] });

    const merged = await mergeMethodologies([one, two], { database: test.db });
    expect(merged).toMatchObject({ status: "draft", createdBy: "merge" });
    expect(merged.tags).toEqual(expect.arrayContaining(["职场", "谈判"]));
    for (const id of [one, two]) {
      const row = test.db.select().from(methodologies).where(eq(methodologies.id, id)).get()!;
      expect(row).toMatchObject({ status: "archived", mergedIntoId: merged.id });
    }
  });

  it("restore 可撤销：恢复原 draft、归档合并结果，其他原 draft 保持归档", async () => {
    const one = addMethodology({ name: "加薪 A" });
    const two = addMethodology({ name: "加薪 B" });
    const merged = await mergeMethodologies([one, two], { database: test.db });

    const restored = changeMethodologyStatus(one, "restore", test.db);
    expect(restored).toMatchObject({ status: "draft", mergedIntoId: null });
    expect(statusOf(merged.id)).toBe("archived");
    expect(statusOf(two)).toBe("archived");
  });

  it("撤销合并时，已确认的合并结果不被归档", async () => {
    const one = addMethodology({ name: "加薪 A" });
    const two = addMethodology({ name: "加薪 B" });
    const merged = await mergeMethodologies([one, two], { database: test.db });
    changeMethodologyStatus(merged.id, "confirm", test.db);
    changeMethodologyStatus(one, "restore", test.db);
    expect(statusOf(merged.id)).toBe("confirmed");
  });

  it("摘录在来源章节块的并集中重新核对，originChunkIds 取并集", async () => {
    const { sourceId, chunkIds } = addSource([
      "在开口之前，请先准备好过去一年的业绩数据和市场薪酬水平。",
      "选择领导心情不错、时间充裕的时机，提前预约十五分钟面谈。",
    ]);
    const one = addMethodology({ sourceId, originChunkIds: [chunkIds[0]] });
    const two = addMethodology({ sourceId, originChunkIds: [chunkIds[1]] });

    const merged = await mergeMethodologies([one, two], {
      database: test.db,
      merge: async (input) => {
        const out = structuredClone(input.drafts[0]);
        out.steps[0].keyPoints = [
          { text: "先准备数据", excerpt: "准备好过去一年的业绩数据", inferred: false },
          { text: "预约时机", excerpt: "提前预约十五分钟面谈", inferred: false },
          { text: "瞎编的", excerpt: "书里根本没有这句话的内容", inferred: false },
        ];
        return out;
      },
    });

    expect(merged.sourceId).toBe(sourceId);
    expect(merged.originChunks.map((c) => c.id).sort()).toEqual([...chunkIds].sort());
    const [first, second, third] = merged.body.steps[0].keyPoints;
    expect(first.excerpt).toMatchObject({ match: "exact", chunkId: chunkIds[0] });
    expect(second.excerpt).toMatchObject({ match: "exact", chunkId: chunkIds[1] });
    expect(second.excerpt!.text).toContain("提前预约十五分钟面谈");
    expect(third.excerpt).toMatchObject({ match: "none", chunkId: null });
  });

  it("成员来自不同资料时，合并结果不属于任何资料", async () => {
    const s1 = addSource(["第一本书的内容。"]);
    const s2 = addSource(["第二本书的内容。"]);
    const one = addMethodology({ sourceId: s1.sourceId, originChunkIds: s1.chunkIds });
    const two = addMethodology({ sourceId: s2.sourceId, originChunkIds: s2.chunkIds });
    const merged = await mergeMethodologies([one, two], { database: test.db });
    expect(merged.sourceId).toBeNull();
  });

  it("参数与状态校验：少于 2 个 400、非 draft 409、不存在 404", async () => {
    const draft = addMethodology();
    const confirmed = addMethodology({ status: "confirmed" });
    await expectApiErrorAsync(mergeMethodologies([draft], { database: test.db }), 400);
    await expectApiErrorAsync(mergeMethodologies([draft, draft], { database: test.db }), 400);
    await expectApiErrorAsync(mergeMethodologies([draft, confirmed], { database: test.db }), 409);
    await expectApiErrorAsync(mergeMethodologies([draft, "nope"], { database: test.db }), 404);
    expect(statusOf(draft)).toBe("draft");
  });

  it("合并期间成员被改动时放弃合并并返回 409", async () => {
    const one = addMethodology();
    const two = addMethodology();
    await expectApiErrorAsync(
      mergeMethodologies([one, two], {
        database: test.db,
        merge: async (input) => {
          changeMethodologyStatus(two, "archive", test.db);
          return structuredClone(input.drafts[0]);
        },
      }),
      409,
    );
    expect(listMethodologies({ status: "draft" }, test.db).map((m) => m.id)).toEqual([one]);
  });

  it("AI 合并失败时不改动原 draft", async () => {
    const one = addMethodology();
    const two = addMethodology();
    await expect(
      mergeMethodologies([one, two], {
        database: test.db,
        merge: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
    expect(statusOf(one)).toBe("draft");
    expect(statusOf(two)).toBe("draft");
  });
});

describe("合并建议", () => {
  function addSuggestion(sourceId: string, ids: string[]): string {
    const id = nanoid();
    test.db
      .insert(mergeSuggestions)
      .values({ id, sourceId, methodologyIds: ids, reason: "很可能相同", status: "open", createdAt: Date.now() })
      .run();
    return id;
  }

  it("接受：执行合并并标记 accepted，不能重复处理", async () => {
    const { sourceId } = addSource(["内容。"]);
    const one = addMethodology({ sourceId });
    const two = addMethodology({ sourceId });
    const suggestionId = addSuggestion(sourceId, [one, two]);

    expect(listMergeSuggestions(sourceId, test.db)).toHaveLength(1);
    const merged = await acceptMergeSuggestion(suggestionId, { database: test.db });
    expect(merged.createdBy).toBe("merge");
    expect(statusOf(one)).toBe("archived");
    expect(
      test.db.select().from(mergeSuggestions).where(eq(mergeSuggestions.id, suggestionId)).get()!.status,
    ).toBe("accepted");
    expect(listMergeSuggestions(sourceId, test.db)).toHaveLength(0);
    await expectApiErrorAsync(acceptMergeSuggestion(suggestionId, { database: test.db }), 409);
  });

  it("任一成员已不是 draft 时接受返回 409，建议保持 open", async () => {
    const { sourceId } = addSource(["内容。"]);
    const one = addMethodology({ sourceId });
    const two = addMethodology({ sourceId, status: "confirmed" });
    const suggestionId = addSuggestion(sourceId, [one, two]);
    await expectApiErrorAsync(acceptMergeSuggestion(suggestionId, { database: test.db }), 409);
    expect(
      test.db.select().from(mergeSuggestions).where(eq(mergeSuggestions.id, suggestionId)).get()!.status,
    ).toBe("open");
    expect(statusOf(one)).toBe("draft");
  });

  it("忽略：标记 dismissed；不存在 404；重复处理 409", () => {
    const { sourceId } = addSource(["内容。"]);
    const suggestionId = addSuggestion(sourceId, [addMethodology({ sourceId }), addMethodology({ sourceId })]);
    expect(dismissMergeSuggestion(suggestionId, test.db)).toEqual({ dismissed: true });
    expect(listMergeSuggestions(sourceId, test.db)).toHaveLength(0);
    expect(listMergeSuggestions(sourceId, test.db, "dismissed")).toHaveLength(1);
    expectApiError(() => dismissMergeSuggestion(suggestionId, test.db), 409);
    expectApiError(() => dismissMergeSuggestion("nope", test.db), 404);
  });

  it("不指定资料时列出所有资料的待处理建议", () => {
    const a = addSource(["甲。"]);
    const b = addSource(["乙。"]);
    addSuggestion(a.sourceId, [addMethodology({ sourceId: a.sourceId }), addMethodology({ sourceId: a.sourceId })]);
    addSuggestion(b.sourceId, [addMethodology({ sourceId: b.sourceId }), addMethodology({ sourceId: b.sourceId })]);
    expect(listMergeSuggestions(undefined, test.db)).toHaveLength(2);
  });
});

describe("列表与标签", () => {
  it("按状态、标签、资料、名称筛选，并统计推断与未匹配摘录", () => {
    const { sourceId } = addSource(["内容。"]);
    const body = makeMethodologyBody({
      steps: [
        makeStep({
          excerpt: { text: "找不到", chunkId: null, match: "none" },
          inferred: false,
        }),
      ],
    });
    const a = addMethodology({ name: "向领导提加薪", status: "confirmed", tagNames: ["职场"], sourceId, body });
    const b = addMethodology({ name: "安慰伴侣", status: "draft", tagNames: ["亲密关系"] });
    addMethodology({ name: "旧的", status: "archived" });

    expect(listMethodologies({ status: "confirmed" }, test.db).map((m) => m.id)).toEqual([a]);
    expect(listMethodologies({ status: "draft" }, test.db).map((m) => m.id)).toEqual([b]);
    expect(listMethodologies({ sourceId }, test.db).map((m) => m.id)).toEqual([a]);
    expect(listMethodologies({ q: "安慰" }, test.db).map((m) => m.id)).toEqual([b]);
    const tagId = test.db.select().from(tags).where(eq(tags.name, "职场")).get()!.id;
    expect(listMethodologies({ tagId }, test.db).map((m) => m.id)).toEqual([a]);
    expect(listMethodologies({}, test.db)).toHaveLength(3);

    const item = listMethodologies({ status: "confirmed" }, test.db)[0];
    expect(item).toMatchObject({
      name: "向领导提加薪",
      tags: ["职场"],
      sourceTitle: "测试书",
      stepCount: 1,
      unmatchedExcerptCount: 1,
    });
    // 步骤本身有摘录；其余节点（适用条件、要点）均为推断
    expect(item.inferredCount).toBe(2);
  });

  it("标签列表含未归档的使用数量", () => {
    addMethodology({ tagNames: ["职场"] });
    addMethodology({ tagNames: ["职场", "谈判"] });
    addMethodology({ tagNames: ["职场"], status: "archived" });
    const result = listTags(test.db);
    expect(result.map((t) => [t.name, t.count])).toEqual([
      ["职场", 2],
      ["谈判", 1],
    ]);
  });
});
