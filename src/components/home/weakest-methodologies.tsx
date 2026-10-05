import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { StartPracticeButton } from "@/components/practice/start-practice-dialog";
import { formatDate, formatMastery } from "@/components/stats/labels";
import { Badge } from "@/components/ui/badge";
import type { WeakestMethodologyDto } from "@/server/dto/stats";

/** 首页「最需要练习」：掌握度最低的方法论，每个可直接开始一场练习。 */
export function WeakestMethodologies({ items }: { items: WeakestMethodologyDto[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">最需要练习</h2>
      {items.length === 0 ? (
        <EmptyState>
          方法论库里还没有已确认的方法论。先
          <Link href="/sources" className="text-foreground mx-1 underline">
            导入资料并抽取
          </Link>
          ，再到
          <Link href="/library" className="text-foreground mx-1 underline">
            方法论库
          </Link>
          确认入库。
        </EmptyState>
      ) : (
        <ul className="divide-y bg-card rounded-xl border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/library/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  掌握度 {formatMastery(item.mastery)} · 最近练习 {formatDate(item.lastPracticedAt)}
                </p>
              </div>
              <StartPracticeButton methodologyId={item.id} label="练习" size="sm" variant="outline" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
