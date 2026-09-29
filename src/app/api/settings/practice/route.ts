import { parseJson, route } from "@/server/http";
import { UpdatePracticeSettingsInput, updatePracticeSettings } from "@/server/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route(async (req: Request) =>
  updatePracticeSettings(await parseJson(req, UpdatePracticeSettingsInput)),
);
