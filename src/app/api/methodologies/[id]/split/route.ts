import { SplitInput } from "@/server/dto/methodology";
import { parseJson, route } from "@/server/http";
import { splitMethodology } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const { stepIds } = await parseJson(req, SplitInput);
  return splitMethodology(id, stepIds);
});
