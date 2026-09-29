import { CreatePracticeInput } from "@/server/dto/session";
import { parseJson, route } from "@/server/http";
import { createPractice } from "@/server/services/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  return createPractice(await parseJson(req, CreatePracticeInput));
});
