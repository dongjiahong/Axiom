import { describe, expect, it } from "vitest";

import { matchExcerpt, normalize, normalizeWithMap } from "@/domain/text-match";

const CHAPTER =
  "提加薪之前，先准备好数据。你需要列出过去一年的具体成果，比如“主导了三个项目，营收增长 20%”。" +
  "然后选择一个合适的时机，例如绩效评估之后，再向领导发起一次专门的谈话。";

describe("normalize", () => {
  it("去掉空白、标点、符号，统一全半角与大小写", () => {
    expect(normalize("Ｈello， World！ 你好 ，世界。")).toBe("helloworld你好世界");
  });

  it("返回归一化下标到原文下标的映射", () => {
    const original = "A, b。C";
    const norm = normalizeWithMap(original);
    expect(norm.text).toBe("abc");
    expect(original.slice(norm.starts[1], norm.ends[1])).toBe("b");
    expect(original.slice(norm.starts[0], norm.ends[2])).toBe("A, b。C");
  });

  it("补充平面字符按单个字符处理", () => {
    const norm = normalizeWithMap("𠮷野家");
    expect(norm.text).toBe("𠮷野家");
    expect(norm.starts).toHaveLength(norm.text.length);
  });
});

describe("matchExcerpt", () => {
  const haystacks = [{ id: "c1", text: CHAPTER }];

  it("精确命中，并还原出原文片段（含标点）", () => {
    const result = matchExcerpt("主导了三个项目 营收增长20％", haystacks);
    expect(result.match).toBe("exact");
    expect(result.chunkId).toBe("c1");
    // 结尾的标点/符号不属于归一化文本，不计入还原出的片段
    expect(result.text).toBe("主导了三个项目，营收增长 20");
  });

  it("忽略全半角与大小写差异", () => {
    const result = matchExcerpt("ＡＢＣＤ", [{ id: "c1", text: "前文 ab cd 后文" }]);
    expect(result.match).toBe("exact");
    expect(result.text).toBe("ab cd");
  });

  it("模糊命中：个别字被改写时按片段比例判断", () => {
    const changed = CHAPTER.replace("发起一次", "发起两次");
    const result = matchExcerpt(changed, haystacks);
    expect(result.match).toBe("fuzzy");
    expect(result.chunkId).toBe("c1");
    expect(result.text).toContain("过去一年的具体成果");
  });

  it("不命中：保留 AI 原文、chunkId 为 null", () => {
    const excerpt = "这是一句原文里完全没有出现过的话语内容";
    expect(matchExcerpt(excerpt, haystacks)).toEqual({ text: excerpt, chunkId: null, match: "none" });
  });

  it("过短的摘录不核对", () => {
    expect(matchExcerpt("加薪", haystacks)).toEqual({ text: "加薪", chunkId: null, match: "none" });
    expect(matchExcerpt("，。！ ", haystacks).match).toBe("none");
  });

  it("多个 haystack 时返回命中的 chunkId", () => {
    const result = matchExcerpt("绩效评估之后", [
      { id: "c1", text: "完全无关的一章，讲的是倾听与复述。" },
      { id: "c2", text: CHAPTER },
      { id: "c3", text: "另一章。" },
    ]);
    expect(result.match).toBe("exact");
    expect(result.chunkId).toBe("c2");
  });

  it("精确命中优先于其他 haystack 中的模糊命中", () => {
    const result = matchExcerpt("选择一个合适的时机，例如绩效评估之后", [
      { id: "c1", text: "选择一个合适的机会，例如绩效评估之前" },
      { id: "c2", text: CHAPTER },
    ]);
    expect(result.match).toBe("exact");
    expect(result.chunkId).toBe("c2");
  });

  it("模糊命中的片段长度不超过摘录的两倍", () => {
    const first = "列出过去一年的具体成果并附上数据佐证材料";
    const second = "选择合适时机在绩效评估之后再向领导发起谈话";
    const text = `${first}${"无关内容".repeat(200)}${second}`;
    const excerpt = `${first}${second}`;
    const result = matchExcerpt(excerpt, [{ id: "c1", text }]);
    expect(result.match).toBe("fuzzy");
    expect(normalize(result.text).length).toBeLessThanOrEqual(normalize(excerpt).length * 2);
  });

  it("不足 8 个字符的摘录整体作为一个片段", () => {
    expect(matchExcerpt("先准备好数据", haystacks).match).toBe("exact");
    expect(matchExcerpt("先准备坏数据", haystacks).match).toBe("none");
  });
});
