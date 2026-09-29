import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { llmCalls } from "@/server/db/schema";
import type { LLMClient, LLMClientConfig } from "@/server/llm/client";
import { LLMNotConfiguredError, LLMUnavailableError } from "@/server/llm/errors";
import {
  getLLMSettings,
  isLLMConfigured,
  maskApiKey,
  readStoredLLMSettings,
} from "@/server/llm/settings";
import {
  UpdateLLMSettingsInput,
  UpdatePracticeSettingsInput,
  getSettings,
  testLLMConnection,
  updateLLMSettings,
  updatePracticeSettings,
} from "@/server/services/settings";
import { MAX_TURNS_DEFAULT } from "@/domain/constants";
import { createTestDb, type TestDb } from "../helpers/db";
import { withFakeLLM } from "../helpers/llm";

const KEY = "test-key-abcdef123456";
const ENV_KEYS = ["AXIOM_FAKE_LLM", "AXIOM_LLM_BASE_URL", "AXIOM_LLM_API_KEY", "AXIOM_LLM_MODEL"];

describe("设置", () => {
  let testDb: TestDb;
  const saved = { ...process.env };

  beforeEach(() => {
    testDb = createTestDb();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    testDb.close();
    process.env = { ...saved };
  });

  const conn = { baseUrl: "https://api.example.com/v1", apiKey: KEY, model: "model-a" };

  it("默认值：未配置、练习轮数为默认值", () => {
    const dto = getSettings(testDb.db);
    expect(dto.llm).toMatchObject({ baseUrl: "", model: "", apiKeyMasked: "", overriddenByEnv: false });
    expect(dto.practice.maxTurns).toBe(MAX_TURNS_DEFAULT);
    expect(isLLMConfigured(testDb.db)).toBe(false);
    expect(() => getLLMSettings(testDb.db)).toThrow(LLMNotConfiguredError);
  });

  it("保存后可读取；API Key 只以掩码出现在 GET 响应中", () => {
    updateLLMSettings(conn, testDb.db);
    const dto = getSettings(testDb.db);
    expect(dto.llm.apiKeyMasked).toBe("****3456");
    expect(JSON.stringify(dto)).not.toContain(KEY);
    expect(JSON.stringify(updateLLMSettings(conn, testDb.db))).not.toContain(KEY);
    expect(getLLMSettings(testDb.db).apiKey).toBe(KEY);
    expect(isLLMConfigured(testDb.db)).toBe(true);
  });

  it("apiKey 省略或为空表示不修改", () => {
    updateLLMSettings(conn, testDb.db);
    updateLLMSettings({ ...conn, apiKey: undefined, model: "model-b" }, testDb.db);
    updateLLMSettings({ ...conn, apiKey: "  ", model: "model-b" }, testDb.db);
    expect(readStoredLLMSettings(testDb.db)).toMatchObject({ apiKey: KEY, model: "model-b" });
  });

  it("连接参数变化时清空能力探测结果，未变化时保留", () => {
    updateLLMSettings(conn, testDb.db);
    testDb.sqlite
      .prepare("update settings set value = json_set(value, '$.supportsJsonMode', json('true'), '$.supportsTemperature', json('false'), '$.testedAt', 123) where key = 'llm'")
      .run();
    updateLLMSettings({ ...conn, apiKey: undefined }, testDb.db);
    expect(readStoredLLMSettings(testDb.db)).toMatchObject({
      supportsJsonMode: true,
      supportsTemperature: false,
      testedAt: 123,
    });
    updateLLMSettings({ ...conn, apiKey: undefined, model: "model-c" }, testDb.db);
    expect(readStoredLLMSettings(testDb.db)).toMatchObject({
      supportsJsonMode: null,
      supportsTemperature: null,
      testedAt: null,
    });
  });

  it("环境变量覆盖数据库值，并标记 overriddenByEnv", () => {
    updateLLMSettings(conn, testDb.db);
    process.env.AXIOM_LLM_BASE_URL = "https://env.example.com/v1";
    process.env.AXIOM_LLM_API_KEY = "env-key-zzzzzzzz9999";
    process.env.AXIOM_LLM_MODEL = "env-model";

    const dto = getSettings(testDb.db);
    expect(dto.llm).toMatchObject({
      baseUrl: "https://env.example.com/v1",
      model: "env-model",
      apiKeyMasked: "****9999",
      overriddenByEnv: true,
    });
    expect(JSON.stringify(dto)).not.toContain("env-key-zzzzzzzz9999");
    expect(getLLMSettings(testDb.db)).toMatchObject({ model: "env-model", apiKey: "env-key-zzzzzzzz9999" });
  });

  it("环境变量只覆盖设置了的字段；空字符串视为未设置", () => {
    updateLLMSettings(conn, testDb.db);
    process.env.AXIOM_LLM_MODEL = "env-model";
    process.env.AXIOM_LLM_BASE_URL = "  ";
    expect(getLLMSettings(testDb.db)).toMatchObject({ baseUrl: conn.baseUrl, model: "env-model" });
  });

  it("仅靠环境变量即可视为已配置", () => {
    process.env.AXIOM_LLM_BASE_URL = "https://env.example.com/v1";
    process.env.AXIOM_LLM_API_KEY = "env-key-zzzzzzzz9999";
    process.env.AXIOM_LLM_MODEL = "env-model";
    expect(isLLMConfigured(testDb.db)).toBe(true);
  });

  it("Fake 模式下无需配置即视为已配置", () => {
    const restore = withFakeLLM();
    try {
      expect(isLLMConfigured(testDb.db)).toBe(true);
    } finally {
      restore();
    }
  });

  it("练习轮数：保存与范围校验", () => {
    expect(updatePracticeSettings({ maxTurns: 20 }, testDb.db).practice.maxTurns).toBe(20);
    expect(getSettings(testDb.db).practice.maxTurns).toBe(20);
    expect(UpdatePracticeSettingsInput.safeParse({ maxTurns: 3 }).success).toBe(false);
    expect(UpdatePracticeSettingsInput.safeParse({ maxTurns: 31 }).success).toBe(false);
    expect(UpdatePracticeSettingsInput.safeParse({ maxTurns: 4 }).success).toBe(true);
    expect(UpdatePracticeSettingsInput.safeParse({ maxTurns: 12.5 }).success).toBe(false);
  });

  it("入参校验：Base URL 必须是 http(s) 地址，模型名非空", () => {
    expect(UpdateLLMSettingsInput.safeParse(conn).success).toBe(true);
    expect(UpdateLLMSettingsInput.safeParse({ ...conn, baseUrl: "not a url" }).success).toBe(false);
    expect(UpdateLLMSettingsInput.safeParse({ ...conn, baseUrl: "ftp://x.com" }).success).toBe(false);
    expect(UpdateLLMSettingsInput.safeParse({ ...conn, model: "  " }).success).toBe(false);
  });

  it("maskApiKey", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("short")).toBe("****");
    expect(maskApiKey("sk-abcdefgh12345678")).toBe("sk-****5678");
    expect(maskApiKey(KEY)).toBe("****3456");
  });
});

describe("测试连接", () => {
  let testDb: TestDb;
  const saved = { ...process.env };

  beforeEach(() => {
    testDb = createTestDb();
    for (const k of ENV_KEYS) delete process.env[k];
    updateLLMSettings({ baseUrl: "https://api.example.com/v1", apiKey: KEY, model: "model-a" }, testDb.db);
  });
  afterEach(() => {
    testDb.close();
    process.env = { ...saved };
  });

  /** 用一个函数模拟端点：根据配置与请求决定返回或抛错。 */
  function fakeEndpoint(
    handler: (config: LLMClientConfig, req: { json: boolean }) => string,
  ): { createClient: (c: LLMClientConfig) => LLMClient; configs: LLMClientConfig[] } {
    const configs: LLMClientConfig[] = [];
    return {
      configs,
      createClient: (config) => {
        configs.push(config);
        return {
          complete: async (req) => ({ text: handler(config, req), promptTokens: 1, completionTokens: 1 }),
        };
      },
    };
  }

  it("全部支持：记录能力并写回设置，同时写入 test 类型的 llm_calls", async () => {
    const { createClient } = fakeEndpoint((_, req) => (req.json ? '{"ok": true}' : "好"));
    const result = await testLLMConnection({ database: testDb.db, createClient });

    expect(result).toMatchObject({ ok: true, supportsJsonMode: true, supportsTemperature: true, sample: "好" });
    expect(readStoredLLMSettings(testDb.db)).toMatchObject({ supportsJsonMode: true, supportsTemperature: true });
    expect(readStoredLLMSettings(testDb.db).testedAt).toBeTypeOf("number");
    const rows = testDb.db.select().from(llmCalls).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.task === "test" && r.status === "ok")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(KEY);
  });

  it("端点拒绝 temperature：改为不带 temperature 重试并记 false", async () => {
    const { createClient, configs } = fakeEndpoint((config, req) => {
      if (config.supportsTemperature) {
        throw new LLMUnavailableError("400", { status: 400, detail: "Unsupported parameter: temperature" });
      }
      return req.json ? '{"ok": true}' : "好";
    });
    const result = await testLLMConnection({ database: testDb.db, createClient });
    expect(result.supportsTemperature).toBe(false);
    expect(configs.map((c) => c.supportsTemperature)).toEqual([true, false, false]);
    expect(readStoredLLMSettings(testDb.db).supportsTemperature).toBe(false);
  });

  it("端点不支持 json_object（400）：记 supportsJsonMode=false，测试仍成功", async () => {
    const { createClient } = fakeEndpoint((_, req) => {
      if (req.json) throw new LLMUnavailableError("400", { status: 400, detail: "response_format unsupported" });
      return "好";
    });
    const result = await testLLMConnection({ database: testDb.db, createClient });
    expect(result).toMatchObject({ supportsJsonMode: false, supportsTemperature: true });
  });

  it("JSON 模式返回了无法解析的内容：记 false", async () => {
    const { createClient } = fakeEndpoint(() => "好");
    expect((await testLLMConnection({ database: testDb.db, createClient })).supportsJsonMode).toBe(false);
  });

  it("其他传输错误直接抛出，且不写回探测结果", async () => {
    const { createClient } = fakeEndpoint(() => {
      throw new LLMUnavailableError("AI 端点拒绝了请求，请检查 API Key", { status: 401 });
    });
    await expect(testLLMConnection({ database: testDb.db, createClient })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(readStoredLLMSettings(testDb.db).testedAt).toBeNull();
    expect(testDb.db.select().from(llmCalls).all()[0]).toMatchObject({ status: "transport_error" });
  });

  it("未配置时抛 LLMNotConfiguredError", async () => {
    const empty = createTestDb();
    try {
      await expect(testLLMConnection({ database: empty.db })).rejects.toBeInstanceOf(LLMNotConfiguredError);
    } finally {
      empty.close();
    }
  });

  it("Fake 模式不访问网络", async () => {
    const restore = withFakeLLM();
    try {
      const empty = createTestDb();
      const result = await testLLMConnection({ database: empty.db });
      expect(result.ok).toBe(true);
      empty.close();
    } finally {
      restore();
    }
  });
});
