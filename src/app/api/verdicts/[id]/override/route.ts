import { OverrideInput } from "@/server/dto/debrief";
import { parseJson, route } from "@/server/http";
import { clearOverride, overrideVerdict } from "@/server/services/debrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  return overrideVerdict(id, await parseJson(req, OverrideInput));
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return clearOverride(id);
});
