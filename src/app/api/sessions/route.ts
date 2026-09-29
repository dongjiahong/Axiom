import { SessionListQuery } from "@/server/dto/session";
import { ApiError, route } from "@/server/http";
import { listSessions } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const parsed = SessionListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "查询参数不合法");
  return listSessions(parsed.data);
});
