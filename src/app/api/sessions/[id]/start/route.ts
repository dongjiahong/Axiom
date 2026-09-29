import { route } from "@/server/http";
import { startSession } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return startSession(id);
});
