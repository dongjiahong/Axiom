import { SaveMethodologyInput } from "@/server/dto/methodology";
import { parseJson, route } from "@/server/http";
import { deleteMethodology, getMethodology, saveMethodology } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  return getMethodology(id);
});

export const PUT = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  return saveMethodology(id, await parseJson(req, SaveMethodologyInput));
});

/** 永久删除已归档且没出过题的方法论。 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  deleteMethodology(id);
  return { id };
});
