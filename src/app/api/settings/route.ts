import { route } from "@/server/http";
import { getSettings } from "@/server/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => getSettings());
