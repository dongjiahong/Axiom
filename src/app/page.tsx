import Link from "next/link";

import { LLMNotConfiguredBanner } from "@/components/common/llm-not-configured-banner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { sessionActionLabel, sessionHref } from "@/components/history/session-links";
import { RecentSessions } from "@/components/history/sessions-table";
import { WeakestMethodologies } from "@/components/home/weakest-methodologies";
import { SESSION_STATUS_LABELS } from "@/components/practice/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOME_RECENT_SESSIONS } from "@/domain/constants";
import { isLLMConfigured } from "@/server/llm/settings";
import { listSessions } from "@/server/services/practice";
import { listWeakestMethodologies } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const weakest = listWeakestMethodologies();
  const recent = listSessions({ page: 1, pageSize: HOME_RECENT_SESSIONS });
  const unfinished = listSessions({ page: 1, pageSize: 1, unfinished: true }).items[0];

  return (
    <div className="space-y-6">
      {isLLMConfigured() ? null : <LLMNotConfiguredBanner />}
      <PageHeader title="首页" description="继续或开始练习、查看最需要练习的方法论与最近的练习记录。" />

      <section>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            {unfinished ? (
              <>
                <div className="min-w-0 space-y-1">
                  <p className="text-muted-foreground text-xs">
                    有一场练习还没完成 · {SESSION_STATUS_LABELS[unfinished.status]}
                  </p>
                  <p className="font-medium">{unfinished.scenarioTitle}</p>
                  <p className="text-muted-foreground text-xs">方法论：{unfinished.methodologyName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={sessionHref(unfinished)}>{sessionActionLabel(unfinished)}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/practice/new">开始新的练习</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="font-medium">开始一场练习</p>
                  <p className="text-muted-foreground text-sm">
                    选一个方法论或随机抽取，AI 扮演对方和你对话，结束后评判你做到了哪些要点。
                  </p>
                </div>
                <Button asChild>
                  <Link href="/practice/new">开始练习</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
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
          <EmptyState className="p-6">还没有练习记录。开始第一场练习吧。</EmptyState>
        ) : (
          <RecentSessions items={recent.items} />
        )}
      </section>
    </div>
  );
}
