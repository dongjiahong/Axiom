import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { SessionsTable } from "@/components/history/sessions-table";
import { Button } from "@/components/ui/button";
import { HISTORY_PAGE_SIZE } from "@/domain/constants";
import { listSessions } from "@/server/services/practice";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const unfinished = first(params.filter) === "unfinished";
  const { items, total } = listSessions({ page, unfinished });
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  const href = (nextPage: number, filter: boolean) => {
    const search = new URLSearchParams();
    if (filter) search.set("filter", "unfinished");
    if (nextPage > 1) search.set("page", String(nextPage));
    const query = search.toString();
    return query ? `/history?${query}` : "/history";
  };

  return (
    <div className="space-y-4">
      <PageHeader title="历史" />

      <LinkTabs
        label="历史筛选"
        items={[
          { key: "all", label: "全部", href: href(1, false), active: !unfinished },
          { key: "unfinished", label: "未完成", href: href(1, true), active: unfinished },
        ]}
      />

      {items.length === 0 ? (
        <EmptyState>
          {total > 0 ? (
            "这一页没有记录。"
          ) : unfinished ? (
            "没有未完成的练习。"
          ) : (
            <>
              还没有练习记录。先
              <Link href="/practice/new" className="text-foreground mx-1 underline">
                新建一场练习
              </Link>
              。
            </>
          )}
        </EmptyState>
      ) : (
        <SessionsTable items={items} />
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            共 {total} 场 · 第 {page} / {pageCount} 页
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={href(page - 1, unfinished)}>上一页</Link>
              </Button>
            ) : null}
            {page < pageCount ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={href(page + 1, unfinished)}>下一页</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
