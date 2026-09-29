import { describe, expect, it } from "vitest";

import { MethodologyBody } from "@/domain/schemas";
import { clusterAll, splitIntoBatches, unionGroups } from "@/server/extraction/cluster";
import { aiToBody, bodyToAi, normalizeTagNames } from "@/server/extraction/mapping";
import { clusterTask } from "@/server/prompts/cluster";
import {
  extractChunkTask,
  validateAiMethodology,
  type AiMethodology,
} from "@/server/prompts/extract-chunk";
import { mergeTask } from "@/server/prompts/merge";
import { CLUSTER_BATCH_OVERLAP, CLUSTER_BATCH_SIZE } from "@/domain/constants";

const CHAPTER = `${"提加薪之前，先准备好数据，再选择合适的时机沟通。".repeat(12)}`;

function fakeMethodology(title = "示例章节", existingTags: string[] = []): AiMethodology {
  const out = extractChunkTask.fake({
    sourceTitle: "书",
    author: null,
    chunkTitle: title,
    chunkText: CHAPTER,
    existingTags,
  });
  return out.methodologies[0];
}

describe("任务 fake() 通过 schema 与 validate", () => {
  it("extract_chunk", () => {
    const input = { sourceTitle: "书", author: null, chunkTitle: "章", chunkText: CHAPTER, existingTags: ["家庭"] };
    const out = extractChunkTask.fake(input);
    expect(extractChunkTask.schema.safeParse(out).success).toBe(true);
    expect(extractChunkTask.validate!(out, input)).toEqual([]);
    expect(out.methodologies[0].suggestedTags).toEqual(["家庭"]);
    expect(extractChunkTask.fake({ ...input, chunkText: "太短了" }).methodologies).toEqual([]);
    expect(extractChunkTask.build(input)[0].content).toContain("家庭");
  });

  it("cluster：名称相同归为一组", () => {
    const input = {
      items: [
        { ref: "m1", name: "甲", summary: "", stepTitles: [], chunkTitle: "" },
        { ref: "m2", name: "乙", summary: "", stepTitles: [], chunkTitle: "" },
        { ref: "m3", name: "甲", summary: "", stepTitles: [], chunkTitle: "" },
      ],
    };
    const out = clusterTask.fake(input);
    expect(out.groups).toEqual([{ refs: ["m1", "m3"], confidence: "high", reason: expect.any(String) }]);
    expect(clusterTask.schema.safeParse(out).success).toBe(true);
    expect(clusterTask.validate!(out, input)).toEqual([]);
  });

  it("merge：以第一个为基础并追加不重复要点", () => {
    const a = fakeMethodology("甲");
    const b = structuredClone(a);
    b.steps[0].keyPoints.push({ text: "额外要点", excerpt: null, inferred: true });
    const input = { drafts: [a, b] };
    const out = mergeTask.fake(input);
    expect(mergeTask.schema.safeParse(out).success).toBe(true);
    expect(mergeTask.validate!(out, input)).toEqual([]);
    expect(out.steps[0].keyPoints.map((k) => k.text)).toContain("额外要点");
    expect(out.steps[0].keyPoints).toHaveLength(3);
  });
});

describe("语义校验", () => {
  it("条件步骤缺 trigger、推断节点带摘录、下标越界、没有非条件步骤", () => {
    const m = fakeMethodology();
    m.steps[1].trigger = null;
    m.applicability[0] = { text: "x", excerpt: "原文", inferred: true };
    m.concepts = [
      { name: "锚定", explanation: "", relatedStepIndexes: [5], excerpt: null, inferred: true },
    ];
    const errors = validateAiMethodology(m, "methodologies[0]");
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toContain("methodologies[0].steps[1]：conditional 为 true 时必须填写 trigger");
    expect(errors.join("\n")).toContain("methodologies[0].applicability[0]");
    expect(errors.join("\n")).toContain("下标 5 超出步骤范围");

    const allConditional = fakeMethodology();
    allConditional.steps[0].conditional = true;
    allConditional.steps[0].trigger = "触发";
    expect(validateAiMethodology(allConditional, "")).toEqual(["steps：至少需要一个非条件步骤"]);
  });

  it("cluster：未知引用、跨组重复", () => {
    const input = {
      items: ["m1", "m2", "m3"].map((ref) => ({ ref, name: ref, summary: "", stepTitles: [], chunkTitle: "" })),
    };
    const errors = clusterTask.validate!(
      {
        groups: [
          { refs: ["m1", "m2"], confidence: "high", reason: "" },
          { refs: ["m2", "m9"], confidence: "medium", reason: "" },
        ],
      },
      input,
    );
    expect(errors.join("\n")).toContain("m2 已出现在其他分组中");
    expect(errors.join("\n")).toContain("m9 不存在");
  });
});

describe("AI 输出 ↔ 领域模型映射", () => {
  it("分配 ID、核对摘录、relatedStepIndexes → relatedStepIds", () => {
    const ai = fakeMethodology();
    ai.concepts = [
      { name: "锚定效应", explanation: "说明", relatedStepIndexes: [1, 1, 0], excerpt: null, inferred: true },
    ];
    ai.steps[0].keyPoints[0].excerpt = "这句话原文里根本没有出现过的内容";
    const body = aiToBody(ai, [{ id: "c1", text: CHAPTER }]);

    expect(MethodologyBody.safeParse(body).success).toBe(true);
    expect(body.steps[0].excerpt).toMatchObject({ match: "exact", chunkId: "c1" });
    expect(body.steps[0].keyPoints[0].excerpt).toMatchObject({ match: "none", chunkId: null });
    expect(body.concepts[0].relatedStepIds).toEqual([body.steps[1].id, body.steps[0].id]);
    const ids = [body.steps[0].id, body.steps[1].id, body.steps[0].keyPoints[0].id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("没有给出摘录的非推断节点按推断内容处理", () => {
    const ai = fakeMethodology();
    ai.steps[0].excerpt = null;
    ai.steps[0].inferred = false;
    const body = aiToBody(ai, [{ id: "c1", text: CHAPTER }]);
    expect(body.steps[0]).toMatchObject({ inferred: true, excerpt: null });
  });

  it("非条件步骤丢弃 trigger", () => {
    const ai = fakeMethodology();
    ai.steps[0].trigger = "多余";
    expect(aiToBody(ai, []).steps[0].trigger).toBeNull();
  });

  it("bodyToAi 往返后结构一致", () => {
    const ai = fakeMethodology();
    const body = aiToBody(ai, [{ id: "c1", text: CHAPTER }]);
    const back = bodyToAi(body, ai.name, ["职场"]);
    expect(back.steps.map((s) => s.title)).toEqual(ai.steps.map((s) => s.title));
    expect(back.steps[0].excerpt).toBe(body.steps[0].excerpt?.text);
    expect(back.suggestedTags).toEqual(["职场"]);
    expect(mergeTask.schema.safeParse(back).success).toBe(true);
  });

  it("标签归一化：去空格、合并同名、丢弃空", () => {
    expect(normalizeTagNames([" 职 场 ", "职场", "", "  ", "亲密关系"])).toEqual(["职场", "亲密关系"]);
  });
});

describe("聚类分批与合并", () => {
  it("不超过批大小时不分批；超过时相邻批次重叠", () => {
    const items = Array.from({ length: 300 }, (_, i) => i);
    expect(splitIntoBatches(items.slice(0, CLUSTER_BATCH_SIZE))).toHaveLength(1);
    const batches = splitIntoBatches(items);
    expect(batches.map((b) => [b[0], b.length])).toEqual([
      [0, 150],
      [130, 150],
      [260, 40],
    ]);
    expect(batches[0].slice(-CLUSTER_BATCH_OVERLAP)).toEqual(batches[1].slice(0, CLUSTER_BATCH_OVERLAP));
  });

  it("有交集的组取并集，medium 优先", () => {
    const merged = unionGroups([
      { refs: ["m1", "m2"], confidence: "high", reason: "A" },
      { refs: ["m2", "m3"], confidence: "medium", reason: "B" },
      { refs: ["m8", "m9"], confidence: "high", reason: "C" },
    ]);
    expect(merged).toEqual([
      { refs: ["m1", "m2", "m3"], confidence: "medium", reason: "A；B" },
      { refs: ["m8", "m9"], confidence: "high", reason: "C" },
    ]);
  });

  it("clusterAll 逐批调用并合并结果", async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      ref: `m${i + 1}`, name: `n${i}`, summary: "", stepTitles: [], chunkTitle: "",
    }));
    const calls: number[] = [];
    const groups = await clusterAll(items, async ({ items: batch }) => {
      calls.push(batch.length);
      const refs = new Set(batch.map((i) => i.ref));
      // 跨批重叠区域内的 m135 与 m140 在两批中都被分到一组
      return refs.has("m135") && refs.has("m140")
        ? { groups: [{ refs: ["m135", "m140"], confidence: "high", reason: "同" }] }
        : { groups: [] };
    });
    expect(calls).toEqual([150, 70]);
    expect(groups).toHaveLength(1);
    expect(groups[0].refs).toEqual(["m135", "m140"]);
  });
});
