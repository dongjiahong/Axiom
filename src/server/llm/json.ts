import { jsonrepair } from "jsonrepair";

export type ExtractJsonResult = { ok: true; value: unknown } | { ok: false; error: string };

const THINK_BLOCK = /<(think|thinking)>[\s\S]*?<\/\1>/gi;
const DANGLING_THINK_CLOSE = /^[\s\S]*<\/(?:think|thinking)>/i;
const CODE_FENCE = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/;

/** 从第一个 `{` 起做字符串感知的括号配对；未闭合时返回 null。 */
function findBalancedObjectEnd(text: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function parseLoose(candidate: string): ExtractJsonResult {
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(jsonrepair(candidate)) };
    } catch {
      return { ok: false, error: "输出不是合法 JSON" };
    }
  }
}

/**
 * 从模型输出中提取 JSON 对象（llm-and-prompts.md §3）：
 * 去掉推理块 → 取第一个代码块 → 截取 `{…}` → JSON.parse → jsonrepair 兜底。
 */
export function extractJson(text: string): ExtractJsonResult {
  let body = text.replace(THINK_BLOCK, "");
  // 有的推理模型只输出结尾标签，开头被端点吞掉。
  body = body.replace(DANGLING_THINK_CLOSE, "");

  const fenced = CODE_FENCE.exec(body);
  if (fenced && fenced[1].includes("{")) body = fenced[1];

  const start = body.indexOf("{");
  if (start === -1) return { ok: false, error: "输出中没有找到 JSON 对象" };

  const end = findBalancedObjectEnd(body, start);
  // 未闭合多半是输出被截断，交给 jsonrepair 补全。
  return parseLoose(end === null ? body.slice(start) : body.slice(start, end + 1));
}
