import { z } from "zod";

import { ApiError, route } from "@/server/http";
import { createBlankMethodology, listMethodologies } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  status: z.enum(["draft", "confirmed", "archived"]).optional(),
  tagId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  q: z.string().optional(),
});

export const GET = route(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) throw new ApiError(400, "invalid_input", "查询参数不合法");
  return listMethodologies(parsed.data);
});

export const POST = route(async () => createBlankMethodology());
