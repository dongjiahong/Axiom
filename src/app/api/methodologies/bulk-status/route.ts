import { BulkStatusInput } from "@/server/dto/methodology";
import { parseJson, route } from "@/server/http";
import { changeMethodologiesStatus } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const input = await parseJson(req, BulkStatusInput);
  return changeMethodologiesStatus(input.ids, input.action);
});
