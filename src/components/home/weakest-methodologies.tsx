"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { WeakestMethodologyDto } from "@/server/dto/stats";

import { formatDate, formatMastery } from "@/components/stats/labels";

/** 首页「最需要练习」：掌握度最低的方法论，每个可直接开始一场专项练习（api-and-ui.md §4.1）。 */
export function WeakestMethodologies({ items }: { items: WeakestMethodologyDto[] }) {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);

  async function startDrill(id: string) {
    setStarting(id);
    try {
      const { sessionId } = await requestJson<{ sessionId: string }>("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "drill",
          selection: "pick",
          methodologyId: id,
          scope: { tagIds: [], sourceIds: [], methodologyIds: [id] },
          difficulty: "neutral",
        }),
      });
      router.push(`/practice/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成场景失败");
      setStarting(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">最需要练习</h2>
      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          方法论库里还没有已确认的方法论。先
          <Link href="/sources" className="text-foreground mx-1 underline">
            导入资料并抽取
          </Link>
          ，再到
          <Link href="/library" className="text-foreground mx-1 underline">
            方法论库
          </Link>
          确认入库。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/library/${item.id}`} className="truncate font-medium hover:underline">
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
                <Button size="sm" disabled={starting === item.id} onClick={() => void startDrill(item.id)}>
                  {starting === item.id ? "正在设计场景……" : "专项练习"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
