import { RetryScenarioInput } from "@/server/dto/session";
import { parseOptionalJson, route } from "@/server/http";
import { retryScenario } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const input = await parseOptionalJson(req, RetryScenarioInput);
  return retryScenario(id, input.mode);
});
