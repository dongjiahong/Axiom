import { describe, expect, it } from "vitest";

import { extractJson } from "@/server/llm/json";

function expectValue(text: string, value: unknown) {
  const result = extractJson(text);
  expect(result).toEqual({ ok: true, value });
}

describe("extractJson", () => {
  it("解析纯 JSON", () => {
    expectValue('{"a": 1, "b": ["x"]}', { a: 1, b: ["x"] });
  });

  it("解析代码块包裹的 JSON", () => {
    expectValue('```json\n{"a": 1}\n```', { a: 1 });
    expectValue('```\n{"a": 1}\n```', { a: 1 });
  });

  it("忽略前后的解释文字", () => {
    expectValue('好的，结果如下：\n{"a": {"b": 2}}\n希望对你有帮助 {不是json}', { a: { b: 2 } });
  });

  it("字符串里的花括号不影响配对", () => {
    expectValue('说明 {"a": "}{", "b": 1} 结束', { a: "}{", b: 1 });
  });

  it("删除 <think> 与 <thinking> 块", () => {
    expectValue('<think>先想想 {"x": 0}</think>{"a": 1}', { a: 1 });
    expectValue('<thinking>\n推理\n</thinking>\n{"a": 1}', { a: 1 });
  });

  it("只有结尾标签的推理块也能去掉", () => {
    expectValue('推理过程 {"x": 0}</think>{"a": 1}', { a: 1 });
  });

  it("用 jsonrepair 修复尾逗号与未闭合的输出", () => {
    expectValue('{"a": 1, "b": [1, 2,],}', { a: 1, b: [1, 2] });
    expectValue('{"a": 1, "b": "文本"', { a: 1, b: "文本" });
  });

  it("完全非法时返回错误", () => {
    expect(extractJson("抱歉，我无法完成这个请求。")).toEqual({
      ok: false,
      error: "输出中没有找到 JSON 对象",
    });
    expect(extractJson("{{{").ok).toBe(false);
    expect(extractJson("")).toMatchObject({ ok: false });
  });
});
