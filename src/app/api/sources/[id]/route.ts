import { route } from "@/server/http";
import { deleteSource, getSourceDetail } from "@/server/services/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return getSourceDetail(id);
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return deleteSource(id);
});
