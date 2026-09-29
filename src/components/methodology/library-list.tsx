"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MethodologyStatus } from "@/server/db/schema";
import type { MethodologyDetailDto, MethodologyListItemDto } from "@/server/dto/methodology";

import { CREATED_BY_LABELS, requestJson, STATUS_LABELS } from "./labels";

interface Props {
  items: MethodologyListItemDto[];
  status: MethodologyStatus;
  filtered: boolean;
  totalInStatus: number;
}

export function LibraryList({ items, status, filtered, totalInStatus }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"merge" | "create" | null>(null);

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, id] : current.filter((x) => x !== id)));

  async function merge() {
    if (selected.length < 2) return;
    setBusy("merge");
    try {
      const created = await requestJson<MethodologyDetailDto>("/api/methodologies/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      toast.success("已合并为新的候选方法论，请核对后确认");
      router.push(`/library/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "合并失败");
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    try {
      const created = await requestJson<MethodologyDetailDto>("/api/methodologies", { method: "POST" });
      router.push(`/library/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新建失败");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {status === "draft" ? (
            <Button variant="outline" disabled={selected.length < 2 || busy !== null} onClick={() => void merge()}>
              {busy === "merge" ? "正在合并……" : `合并所选（${selected.length}）`}
            </Button>
          ) : null}
          {selected.length === 2 ? (
            <Button variant="ghost" asChild>
              <Link href={`/library/compare?a=${selected[0]}&b=${selected[1]}`}>对比所选</Link>
            </Button>
          ) : null}
        </div>
        <Button onClick={() => void create()} disabled={busy !== null}>
          新建方法论
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState status={status} filtered={filtered} totalInStatus={totalInStatus} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <Checkbox
                className="mt-1"
                checked={selected.includes(item.id)}
                onCheckedChange={(value) => toggle(item.id, value === true)}
                aria-label={`选择「${item.name}」`}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/library/${item.id}`} className="font-medium hover:underline">
                    {item.name || "（未命名）"}
                  </Link>
                  <Badge variant={item.status === "confirmed" ? "default" : "outline"}>
                    {STATUS_LABELS[item.status]}
                  </Badge>
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span>{item.stepCount} 个步骤</span>
                  <span>
                    来源：{item.sourceTitle ?? (item.sourceId ? "资料" : CREATED_BY_LABELS[item.createdBy])}
                  </span>
                  {item.status === "confirmed" ? <span>版本 {item.version}</span> : null}
                  {item.inferredCount > 0 ? <span>{item.inferredCount} 处 AI 推断</span> : null}
                  {item.unmatchedExcerptCount > 0 ? (
                    <span className="text-amber-600">{item.unmatchedExcerptCount} 处摘录未匹配</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  status,
  filtered,
  totalInStatus,
}: {
  status: MethodologyStatus;
  filtered: boolean;
  totalInStatus: number;
}) {
  let text: string;
  let action: { href: string; label: string } | null = null;
  if (filtered && totalInStatus > 0) {
    text = "没有符合筛选条件的方法论。";
  } else if (status === "confirmed") {
    text = "方法论库还是空的。先导入资料并抽取，审阅候选方法论后确认入库；也可以直接新建。";
    action = { href: "/sources", label: "去导入资料" };
  } else if (status === "draft") {
    text = "没有待审阅的候选方法论。导入资料并抽取后，候选方法论会出现在这里。";
    action = { href: "/sources", label: "去导入资料" };
  } else {
    text = "没有已归档的方法论。";
  }
  return (
    <div className="text-muted-foreground space-y-3 rounded-lg border border-dashed p-8 text-center text-sm">
      <p>{text}</p>
      {action ? (
        <Button variant="outline" asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
