import { SendMessageInput } from "@/server/dto/session";
import { parseJson, route } from "@/server/http";
import { sendMessage } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const { content } = await parseJson(req, SendMessageInput);
  return sendMessage(id, content);
});
