import { SelectMethodologyInput } from "@/server/dto/session";
import { parseJson, route } from "@/server/http";
import { selectMethodology } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const { methodologyId } = await parseJson(req, SelectMethodologyInput);
  return selectMethodology(id, methodologyId);
});
