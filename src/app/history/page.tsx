import Link from "next/link";

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
  const { items, total } = listSessions({ page });
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">历史</h1>
        <p className="text-muted-foreground text-sm">
          每一场练习的时间、难度、执行分与说服结果；未结束的可以继续，已复盘的可以查看复盘。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          {total === 0 ? (
            <>
              还没有练习记录。先
              <Link href="/practice/new" className="text-foreground mx-1 underline">
                新建一场练习
              </Link>
              。
            </>
          ) : (
            "这一页没有记录。"
          )}
        </div>
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
                <Link href={`/history?page=${page - 1}`}>上一页</Link>
              </Button>
            ) : null}
            {page < pageCount ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/history?page=${page + 1}`}>下一页</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
