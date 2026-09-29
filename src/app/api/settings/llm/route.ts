import { parseJson, route } from "@/server/http";
import { UpdateLLMSettingsInput, updateLLMSettings } from "@/server/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route(async (req: Request) =>
  updateLLMSettings(await parseJson(req, UpdateLLMSettingsInput)),
);
