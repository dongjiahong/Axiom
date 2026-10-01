import { route } from "@/server/http";
import { abandonSession, getSession } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return getSession(id);
});

/** 放弃还没开始的练习。 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return abandonSession(id);
});
