import { LLMNotConfiguredBanner } from "@/components/common/llm-not-configured-banner";
import { WeakestMethodologies } from "@/components/home/weakest-methodologies";
import { isLLMConfigured } from "@/server/llm/settings";
import { listWeakestMethodologies } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const weakest = listWeakestMethodologies();

  return (
    <div className="space-y-6">
      {isLLMConfigured() ? null : <LLMNotConfiguredBanner />}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">首页</h1>
        <p className="text-muted-foreground text-sm">
          快捷开始练习、查看最需要练习的方法论与最近的练习记录。
        </p>
      </div>
      <WeakestMethodologies items={weakest} />
    </div>
  );
}
