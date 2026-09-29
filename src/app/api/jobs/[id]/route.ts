import { route } from "@/server/http";
import { getJob } from "@/server/services/extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return getJob(id);
});
