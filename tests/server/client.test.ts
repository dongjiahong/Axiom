import { describe, expect, it } from "vitest";

import { LLMTruncatedError, LLMUnavailableError } from "@/server/llm/errors";
import { OpenAICompatClient, redactSecret } from "@/server/llm/client";

const KEY = "test-key-abcdef123456";

/** 把内容拆成多块的 SSE 流，最后一块带 finish_reason 与 usage。 */
function completion(content: string, finishReason = "stop", pieces: string[] = [content]) {
  const chunk = (delta: Record<string, unknown>, finish: string | null, usage?: unknown) => ({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  });
  const events = [
    chunk({ role: "assistant", reasoning_content: "先想一想" }, null),
    ...pieces.map((piece) => chunk({ content: piece }, null)),
    chunk({}, finishReason),
    { ...chunk({}, null), choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } },
  ];
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** 记录请求体的 fetch 桩。 */
function stubFetch(respond: () => Response) {
  const bodies: Record<string, unknown>[] = [];
  const headers: Headers[] = [];
  const fn: typeof fetch = async (input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(new Headers(init?.headers));
    return respond();
  };
  return { fn, bodies, headers };
}

function makeClient(
  fetchFn: typeof fetch,
  caps: { supportsJsonMode?: boolean | null; supportsTemperature?: boolean | null } = {},
) {
  return new OpenAICompatClient({
    baseUrl: "https://api.example.com/v1",
    apiKey: KEY,
    model: "model-a",
    supportsJsonMode: caps.supportsJsonMode ?? null,
    supportsTemperature: caps.supportsTemperature ?? null,
    fetch: fetchFn,
  });
}

const req = { messages: [{ role: "user" as const, content: "你好" }], temperature: 0.3, json: true };

describe("OpenAICompatClient", () => {
  it("返回文本与 token 用量；请求带模型名与 Authorization", async () => {
    const stub = stubFetch(() => completion("好"));
    const res = await makeClient(stub.fn).complete(req);
    expect(res).toEqual({ text: "好", promptTokens: 7, completionTokens: 3 });
    expect(stub.bodies[0]).toMatchObject({ model: "model-a", messages: req.messages });
    expect(stub.headers[0].get("authorization")).toBe(`Bearer ${KEY}`);
    expect(stub.bodies[0]).not.toHaveProperty("max_tokens");
  });

  it("用流式请求：拼接多块 content，忽略 reasoning_content", async () => {
    const stub = stubFetch(() => completion("", "stop", ['{"a":', " 1", "}", "好"]));
    const res = await makeClient(stub.fn).complete(req);
    expect(res.text).toBe('{"a": 1}好');
    expect(stub.bodies[0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it("temperature：仅在 supportsTemperature !== false 时发送", async () => {
    const on = stubFetch(() => completion("好"));
    await makeClient(on.fn, { supportsTemperature: null }).complete(req);
    expect(on.bodies[0].temperature).toBe(0.3);

    const off = stubFetch(() => completion("好"));
    await makeClient(off.fn, { supportsTemperature: false }).complete(req);
    expect(off.bodies[0]).not.toHaveProperty("temperature");
  });

  it("response_format：仅在 json 且 supportsJsonMode === true 时发送", async () => {
    const known = stubFetch(() => completion("{}"));
    await makeClient(known.fn, { supportsJsonMode: true }).complete(req);
    expect(known.bodies[0].response_format).toEqual({ type: "json_object" });

    for (const [caps, json] of [
      [{ supportsJsonMode: null }, true],
      [{ supportsJsonMode: false }, true],
      [{ supportsJsonMode: true }, false],
    ] as const) {
      const stub = stubFetch(() => completion("{}"));
      await makeClient(stub.fn, caps).complete({ ...req, json });
      expect(stub.bodies[0]).not.toHaveProperty("response_format");
    }
  });

  it("finish_reason=length 抛 LLMTruncatedError 并带上已有文本", async () => {
    const stub = stubFetch(() => completion('{"a": ', "length"));
    const err = await makeClient(stub.fn).complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(LLMTruncatedError);
    expect(err).toMatchObject({ text: '{"a": ', promptTokens: 7, completionTokens: 3 });
  });

  it("4xx 转为 LLMUnavailableError，保留状态码，错误信息不含 API Key", async () => {
    const stub = stubFetch(() =>
      jsonResponse({ error: { message: `Unsupported parameter: temperature (key ${KEY})` } }, 400),
    );
    const err = await makeClient(stub.fn).complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(LLMUnavailableError);
    expect(err.status).toBe(400);
    expect(err.detail).toContain("temperature");
    expect(`${err.message}|${err.detail}`).not.toContain(KEY);
  });

  it("401 给出检查 API Key 的中文提示", async () => {
    const stub = stubFetch(() => jsonResponse({ error: { message: `bad key ${KEY}` } }, 401));
    const err = await makeClient(stub.fn).complete(req).catch((e) => e);
    expect(err.status).toBe(401);
    expect(err.message).toContain("API Key");
    expect(`${err.message}|${err.detail}`).not.toContain(KEY);
  });

  it("网络错误转为 LLMUnavailableError", async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError(`connect failed with ${KEY}`);
    };
    const client = new OpenAICompatClient({
      baseUrl: "https://api.example.com/v1",
      apiKey: KEY,
      model: "m",
      supportsJsonMode: null,
      supportsTemperature: null,
      fetch: failing,
    });
    // SDK 会对网络错误退避重试（约 3 秒），所以本用例单独放宽超时
    const err = await client.complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(LLMUnavailableError);
    expect(`${err.message}|${err.detail}`).not.toContain(KEY);
  }, 20000);

  it("signal 已中止时原样抛出中止错误，而不是 LLMUnavailableError", async () => {
    const stub = stubFetch(() => completion("好"));
    const err = await makeClient(stub.fn)
      .complete({ ...req, signal: AbortSignal.abort() })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LLMUnavailableError);
  });
});

describe("redactSecret", () => {
  it("替换所有出现的密钥；太短的密钥不处理", () => {
    expect(redactSecret(`a ${KEY} b ${KEY}`, KEY)).toBe("a **** b ****");
    expect(redactSecret("abc", "abc")).toBe("abc");
  });
});
