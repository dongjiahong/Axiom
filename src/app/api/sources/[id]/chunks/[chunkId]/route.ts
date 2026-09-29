import { z } from "zod";

import { parseJson, route } from "@/server/http";
import { getChunkText, setChunkSkipped } from "@/server/services/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; chunkId: string }> };

const PatchInput = z.object({ skipped: z.boolean() });

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id, chunkId } = await params;
  return getChunkText(id, chunkId);
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const { id, chunkId } = await params;
  const { skipped } = await parseJson(req, PatchInput);
  return setChunkSkipped(id, chunkId, skipped);
});
