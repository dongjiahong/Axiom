import { z } from "zod";

import { parseJson, route } from "@/server/http";
import { setAllChunksSkipped } from "@/server/services/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PatchInput = z.object({ skipped: z.boolean() });

export const PATCH = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const { skipped } = await parseJson(req, PatchInput);
  return setAllChunksSkipped(id, skipped);
});
