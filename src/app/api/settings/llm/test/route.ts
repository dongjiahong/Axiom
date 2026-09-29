import { route } from "@/server/http";
import { testLLMConnection } from "@/server/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async () => testLLMConnection());
