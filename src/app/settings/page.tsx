import { dirname, resolve } from "node:path";

import { PageHeader } from "@/components/common/page-header";
import { SettingsForm } from "@/components/common/settings-form";
import { resolveDbPath } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getSettings();
  const dataDir = dirname(resolve(resolveDbPath()));

  return (
    <div className="space-y-4">
      <PageHeader title="设置" />
      <div className="max-w-3xl">
        <SettingsForm initial={settings} dataDir={dataDir} />
      </div>
    </div>
  );
}
