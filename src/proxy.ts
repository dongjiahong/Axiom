import { NextResponse, type NextRequest } from "next/server";

import { GATE_COOKIE, gatePassword, verifyGateToken } from "@/server/gate";

/** 门禁（见 src/server/gate.ts）：未通过时页面跳转到 /gate，接口返回 401。 */

/**
 * 跳转必须是绝对地址（Next 不接受相对 Location）。反向代理后 request.url 的 origin
 * 是内部的 127.0.0.1:3000，所以按 Nginx 传来的 Host 与 X-Forwarded-Proto 还原用户访问的地址。
 */
function redirectTo(request: NextRequest, location: string) {
  const first = (value: string | null) => value?.split(",")[0].trim();
  const proto = first(request.headers.get("x-forwarded-proto")) || request.nextUrl.protocol.replace(":", "");
  const host = first(request.headers.get("x-forwarded-host")) || request.headers.get("host") || request.nextUrl.host;
  return NextResponse.redirect(`${proto}://${host}${location}`);
}

export function proxy(request: NextRequest) {
  const password = gatePassword();
  if (!password) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/api/gate") return NextResponse.next();

  const passed = verifyGateToken(request.cookies.get(GATE_COOKIE)?.value, password);
  if (pathname === "/gate") return passed ? redirectTo(request, "/") : NextResponse.next();
  if (passed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "需要先通过门禁，请刷新页面后输入口令" } },
      { status: 401 },
    );
  }
  const target = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return redirectTo(request, `/gate${target}`);
}

export const config = {
  // 站点图标与 manifest 必须免门禁：PWA 安装时由浏览器直接抓取，跳转到 /gate 会读不到。
  matcher: [
    "/((?!_next/|icon\\.svg$|favicon\\.ico$|apple-icon\\.png$|icon-192\\.png$|icon-512\\.png$|icon-512-maskable\\.png$|site\\.webmanifest$).*)",
  ],
};
