import type { z } from "zod";

/** 通用提示词片段与 Zod 错误中文化（llm-and-prompts.md §4）。 */

/** 每个任务的系统提示词末尾都附上；`schemaDescription` 由任务手写，须与 Zod schema 同步。 */
export function outputFormatPrompt(schemaDescription: string): string {
  return [
    "【输出格式】",
    "只输出一个 JSON 对象，不要使用 Markdown 代码块，不要输出任何解释。",
    "所有面向用户的文字使用简体中文。",
    "JSON 结构如下（`?` 表示可为 null）：",
    schemaDescription,
  ].join("\n");
}

/** JSON 不合规时追加给模型的修正提示。 */
export function correctionPrompt(errors: string[]): string {
  return [
    "你上一次的输出不符合要求：",
    ...errors.map((e) => `- ${e}`),
    "请修正后重新输出完整的 JSON 对象。只输出 JSON，不要任何解释或代码块标记。",
  ].join("\n");
}

const TYPE_NAMES: Record<string, string> = {
  string: "字符串",
  number: "数字",
  int: "整数",
  boolean: "布尔值",
  array: "数组",
  object: "对象",
  null: "null",
};

/** `["keyPointVerdicts", 3, "quality"]` → `keyPointVerdicts[3].quality`；空路径为 `根对象`。 */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "根对象";
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    const name = String(seg);
    return acc ? `${acc}.${name}` : name;
  }, "");
}

function describeIssue(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type": {
      const expected = TYPE_NAMES[issue.expected] ?? issue.expected;
      return issue.message.includes("received undefined")
        ? `缺少必填字段（应为${expected}）`
        : `类型不对，应为${expected}`;
    }
    case "invalid_value":
      return `应为以下之一：${issue.values.map((v) => JSON.stringify(v)).join("、")}`;
    case "too_small": {
      const min = String(issue.minimum);
      if (issue.origin === "string") return `长度不能小于 ${min}`;
      if (issue.origin === "array" || issue.origin === "set") return `至少需要 ${min} 项`;
      return `不能小于 ${min}`;
    }
    case "too_big": {
      const max = String(issue.maximum);
      if (issue.origin === "string") return `长度不能大于 ${max}`;
      if (issue.origin === "array" || issue.origin === "set") return `最多 ${max} 项`;
      return `不能大于 ${max}`;
    }
    case "unrecognized_keys":
      return `包含未知字段：${issue.keys.join("、")}`;
    case "invalid_format":
      return "格式不正确";
    default:
      return issue.message;
  }
}

/** Zod 错误 → 中文错误列表，如 `keyPointVerdicts[3].quality：不能大于 5`。 */
export function zodErrorToMessages(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${formatIssuePath(issue.path)}：${describeIssue(issue)}`);
}
