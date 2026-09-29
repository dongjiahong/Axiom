import { MergeMethodologiesInput } from "@/server/dto/methodology";
import { parseJson, route } from "@/server/http";
import { mergeMethodologies } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const { ids } = await parseJson(req, MergeMethodologiesInput);
  return mergeMethodologies(ids);
});
