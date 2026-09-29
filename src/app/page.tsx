import Link from "next/link";
import { BookOpenCheck, Target } from "lucide-react";

import { LLMNotConfiguredBanner } from "@/components/common/llm-not-configured-banner";
import { RecentSessions } from "@/components/history/sessions-table";
import { WeakestMethodologies } from "@/components/home/weakest-methodologies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { HOME_RECENT_SESSIONS } from "@/domain/constants";
import { isLLMConfigured } from "@/server/llm/settings";
import { listSessions } from "@/server/services/practice";
import { listWeakestMethodologies } from "@/server/services/stats";

export const dynamic = "force-dynamic";

const ENTRIES = [
  {
    href: "/practice/new?mode=drill",
    icon: Target,
    title: "专项练习",
    description: "目标方法论对你可见，只评判执行；对话中可以展开查看方法论骨架。",
  },
  {
    href: "/practice/new?mode=quiz",
    icon: BookOpenCheck,
    title: "综合测验",
    description: "目标方法论对你隐藏，开场前自己选择要用的方法论，同时评判识别与执行。",
  },
] as const;

export default function HomePage() {
  const weakest = listWeakestMethodologies();
  const recent = listSessions({ page: 1, pageSize: HOME_RECENT_SESSIONS });

  return (
    <div className="space-y-6">
      {isLLMConfigured() ? null : <LLMNotConfiguredBanner />}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">首页</h1>
        <p className="text-muted-foreground text-sm">
          快捷开始练习、查看最需要练习的方法论与最近的练习记录。
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {ENTRIES.map((entry) => (
          <Card key={entry.href}>
            <CardContent className="flex h-full flex-col items-start gap-3 py-4">
              <div className="flex items-center gap-2">
                <entry.icon className="size-4" />
                <CardTitle className="text-base">{entry.title}</CardTitle>
              </div>
              <CardDescription className="flex-1">{entry.description}</CardDescription>
              <Button size="sm" asChild>
                <Link href={entry.href}>开始{entry.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <WeakestMethodologies items={weakest} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近练习</h2>
          <Link href="/history" className="text-muted-foreground text-sm hover:underline">
            查看全部历史
          </Link>
        </div>
        {recent.items.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            还没有练习记录。从上面的快捷入口开始第一场练习吧。
          </div>
        ) : (
          <RecentSessions items={recent.items} />
        )}
      </section>
    </div>
  );
}
