import { route } from "@/server/http";
import { listTags } from "@/server/services/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => listTags());
