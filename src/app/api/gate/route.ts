import { cookies } from "next/headers";
import { z } from "zod";

import { GATE_COOKIE_MAX_AGE_MS } from "@/domain/constants";
import {
  clientKey,
  createGateToken,
  GATE_COOKIE,
  gateLimiter,
  gatePassword,
  passwordMatches,
} from "@/server/gate";
import { ApiError, parseJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GateInput = z.object({ password: z.string().max(200) });

export const POST = route(async (req: Request) => {
  const password = gatePassword();
  if (!password) return { ok: true };

  const key = clientKey(req);
  const waitMs = gateLimiter.retryAfterMs(key);
  if (waitMs > 0) {
    throw new ApiError(429, "too_many_attempts", `尝试次数过多，请 ${Math.ceil(waitMs / 60000)} 分钟后再试`);
  }

  const input = await parseJson(req, GateInput);
  if (!passwordMatches(input.password, password)) {
    gateLimiter.recordFailure(key);
    throw new ApiError(401, "unauthorized", "口令不正确");
  }
  gateLimiter.reset(key);

  // 只有 HTTPS 下才加 Secure，否则本地 http 访问时浏览器会丢弃 Cookie。
  const https = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  (await cookies()).set(GATE_COOKIE, createGateToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE_MS / 1000,
  });
  return { ok: true };
});
