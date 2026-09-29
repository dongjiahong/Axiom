import { ApiError, route } from "@/server/http";
import { StatsQuery } from "@/server/dto/stats";
import { getStatsConfusion } from "@/server/services/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const parsed = StatsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "查询参数不合法");
  return getStatsConfusion(parsed.data);
});
