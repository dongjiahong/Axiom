import { dirname, resolve } from "node:path";

import { SettingsForm } from "@/components/common/settings-form";
import { resolveDbPath } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getSettings();
  const dataDir = dirname(resolve(resolveDbPath()));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="text-muted-foreground text-sm">配置 AI 模型端点与练习轮数上限。</p>
      </div>
      <SettingsForm initial={settings} dataDir={dataDir} />
    </div>
  );
}
