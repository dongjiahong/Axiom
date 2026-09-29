import { z } from "zod";

import { ApiError, route } from "@/server/http";
import { listMergeSuggestions } from "@/server/services/extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  sourceId: z.string().min(1).optional(),
  status: z.enum(["open", "accepted", "dismissed"]).optional(),
});

export const GET = route(async (req: Request) => {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "查询参数不合法");
  return listMergeSuggestions(parsed.data.sourceId, undefined, parsed.data.status);
});
