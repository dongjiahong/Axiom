import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  GATE_COOKIE_MAX_AGE_MS,
  GATE_FAILURE_WINDOW_MS,
  GATE_MAX_FAILURES,
} from "@/domain/constants";

/**
 * 门禁：环境变量 `AXIOM_ACCESS_PASSWORD` 非空时，访问页面与接口都需要先输入口令。
 * 通过后下发带签名的 Cookie（有效期见 GATE_COOKIE_MAX_AGE_MS）；Cookie 里不含口令，
 * 签名密钥就是口令本身，所以修改口令会让所有已发出的 Cookie 立即失效。
 */

export const GATE_COOKIE = "axiom_gate";

/** 门禁口令；未设置（或为空白）时返回 null，表示不启用门禁。 */
export function gatePassword(): string | null {
  return process.env.AXIOM_ACCESS_PASSWORD?.trim() || null;
}

function sign(expiresAt: number, password: string): string {
  return createHmac("sha256", password).update(`axiom-gate:${expiresAt}`).digest("hex");
}

/** 先取哈希再比较，避免长度不同导致 timingSafeEqual 抛错，也不泄露长度。 */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function passwordMatches(input: string, password: string): boolean {
  return safeEqual(input.trim(), password);
}

/** 生成通行凭证，格式 `<过期时间戳>.<签名>`。 */
export function createGateToken(password: string, now: number = Date.now()): string {
  const expiresAt = now + GATE_COOKIE_MAX_AGE_MS;
  return `${expiresAt}.${sign(expiresAt, password)}`;
}

export function verifyGateToken(
  token: string | undefined,
  password: string,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expiresAt = Number(parts[0]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  return safeEqual(parts[1], sign(expiresAt, password));
}

/** 登录后的跳转目标只允许站内路径，防止被构造成开放重定向。 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** 按来源限制输错口令的次数：窗口内失败达到上限即锁定到窗口结束。 */
export class FailureLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number = GATE_MAX_FAILURES,
    private readonly windowMs: number = GATE_FAILURE_WINDOW_MS,
  ) {}

  /** 仍需等待的毫秒数；0 表示可以尝试。 */
  retryAfterMs(key: string, now: number = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.maxFailures ? entry.resetAt - now : 0;
  }

  recordFailure(key: string, now: number = Date.now()): void {
    for (const [k, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(k);
    }
    const entry = this.entries.get(key);
    if (entry) entry.count += 1;
    else this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

export const gateLimiter = new FailureLimiter();

/**
 * 限流用的来源标识。Nginx 会用 `$remote_addr` 覆盖 X-Real-IP；
 * 没有反向代理时取不到，所有请求共用同一个标识。
 */
export function clientKey(req: Request): string {
  return req.headers.get("x-real-ip")?.trim() || "direct";
}
