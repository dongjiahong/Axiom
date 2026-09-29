import { afterEach, describe, expect, it, vi } from "vitest";

import { GATE_COOKIE_MAX_AGE_MS } from "@/domain/constants";
import {
  clientKey,
  createGateToken,
  FailureLimiter,
  gatePassword,
  passwordMatches,
  safeNext,
  verifyGateToken,
} from "@/server/gate";

const PASSWORD = "correct horse battery staple";
const NOW = 1_700_000_000_000;

afterEach(() => vi.unstubAllEnvs());

describe("门禁口令", () => {
  it("未设置或只有空白时不启用门禁", () => {
    vi.stubEnv("AXIOM_ACCESS_PASSWORD", "");
    expect(gatePassword()).toBeNull();
    vi.stubEnv("AXIOM_ACCESS_PASSWORD", "   ");
    expect(gatePassword()).toBeNull();
  });

  it("设置后取去掉首尾空白的值", () => {
    vi.stubEnv("AXIOM_ACCESS_PASSWORD", `  ${PASSWORD}\n`);
    expect(gatePassword()).toBe(PASSWORD);
  });

  it("口令比对：正确通过，错误或长度不同都不通过，输入首尾空白被忽略", () => {
    expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    expect(passwordMatches(` ${PASSWORD} `, PASSWORD)).toBe(true);
    expect(passwordMatches("wrong", PASSWORD)).toBe(false);
    expect(passwordMatches(PASSWORD + "x", PASSWORD)).toBe(false);
    expect(passwordMatches("", PASSWORD)).toBe(false);
  });
});

describe("通行凭证", () => {
  it("有效期内通过，凭证里不含口令", () => {
    const token = createGateToken(PASSWORD, NOW);
    expect(token).not.toContain(PASSWORD);
    expect(verifyGateToken(token, PASSWORD, NOW + 1000)).toBe(true);
  });

  it("有效期为 7 天：最后一刻仍有效，到期即失效", () => {
    const token = createGateToken(PASSWORD, NOW);
    expect(GATE_COOKIE_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(verifyGateToken(token, PASSWORD, NOW + GATE_COOKIE_MAX_AGE_MS - 1)).toBe(true);
    expect(verifyGateToken(token, PASSWORD, NOW + GATE_COOKIE_MAX_AGE_MS)).toBe(false);
  });

  it("修改口令后旧凭证立即失效", () => {
    const token = createGateToken(PASSWORD, NOW);
    expect(verifyGateToken(token, "another password", NOW)).toBe(false);
  });

  it("篡改过期时间或签名都不通过", () => {
    const token = createGateToken(PASSWORD, NOW);
    const [expiresAt, signature] = token.split(".");
    expect(verifyGateToken(`${Number(expiresAt) + 1}.${signature}`, PASSWORD, NOW)).toBe(false);
    expect(verifyGateToken(`${expiresAt}.${"0".repeat(signature.length)}`, PASSWORD, NOW)).toBe(false);
    expect(verifyGateToken(`${expiresAt}.${signature}00`, PASSWORD, NOW)).toBe(false);
  });

  it("格式不对的凭证都不通过", () => {
    for (const bad of [undefined, "", "abc", "1.2.3", ".", "NaN.abc", `${NOW + 1000}.`]) {
      expect(verifyGateToken(bad, PASSWORD, NOW)).toBe(false);
    }
  });
});

describe("登录后的跳转目标", () => {
  it("只接受站内路径，其余回到首页", () => {
    expect(safeNext("/library?tag=a")).toBe("/library?tag=a");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", undefined, 1, null]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});

describe("输错口令限流", () => {
  const limiter = () => new FailureLimiter(3, 1000);

  it("达到上限后锁定到窗口结束，之后恢复", () => {
    const l = limiter();
    for (let i = 0; i < 2; i++) l.recordFailure("a", NOW);
    expect(l.retryAfterMs("a", NOW)).toBe(0);
    l.recordFailure("a", NOW);
    expect(l.retryAfterMs("a", NOW + 300)).toBe(700);
    expect(l.retryAfterMs("a", NOW + 1000)).toBe(0);
  });

  it("不同来源互不影响", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.recordFailure("a", NOW);
    expect(l.retryAfterMs("a", NOW)).toBeGreaterThan(0);
    expect(l.retryAfterMs("b", NOW)).toBe(0);
  });

  it("验证成功后清零", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.recordFailure("a", NOW);
    l.reset("a");
    expect(l.retryAfterMs("a", NOW)).toBe(0);
  });

  it("窗口过期后重新计数", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.recordFailure("a", NOW);
    l.recordFailure("a", NOW + 2000);
    expect(l.retryAfterMs("a", NOW + 2000)).toBe(0);
  });
});

describe("来源标识", () => {
  it("优先取 Nginx 设置的 X-Real-IP，没有则共用同一个标识", () => {
    expect(clientKey(new Request("http://x/", { headers: { "x-real-ip": " 1.2.3.4 " } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x/"))).toBe("direct");
  });
});
