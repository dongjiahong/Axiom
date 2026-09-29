import { ApiError, route } from "@/server/http";
import { changeMethodologyStatus, type StatusAction } from "@/server/services/methodologies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; action: string }> };

const ACTIONS: StatusAction[] = ["confirm", "unconfirm", "archive", "restore"];

export const POST = route(async (_req: Request, { params }: Params) => {
  const { id, action } = await params;
  if (!ACTIONS.includes(action as StatusAction)) throw new ApiError(404, "not_found", "接口不存在");
  return changeMethodologyStatus(id, action as StatusAction);
});
