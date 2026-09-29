import { route } from "@/server/http";
import { generateDebrief, getDebrief } from "@/server/services/debrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return generateDebrief(id);
});

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return getDebrief(id);
});
