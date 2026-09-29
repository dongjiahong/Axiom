import { PlaceholderPage } from "@/components/common/placeholder-page";
import { LLMNotConfiguredBanner } from "@/components/common/llm-not-configured-banner";
import { isLLMConfigured } from "@/server/llm/settings";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-4">
      {isLLMConfigured() ? null : <LLMNotConfiguredBanner />}
      <PlaceholderPage
        title="首页"
        description="快捷开始练习、查看最需要练习的方法论与最近的练习记录。"
      />
    </div>
  );
}
