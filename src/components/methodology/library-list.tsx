"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MethodologyStatus } from "@/server/db/schema";
import type {
  BulkStatusResultDto,
  MethodologyDetailDto,
  MethodologyListItemDto,
} from "@/server/dto/methodology";
import type { StatusAction } from "@/server/services/methodologies";

import { CREATED_BY_LABELS, requestJson, STATUS_LABELS } from "./labels";

/** 批量状态迁移时的按钮文案。 */
const ACTION_LABELS: Record<StatusAction, string> = {
  confirm: "确认入库",
  unconfirm: "退回候选",
  archive: "归档",
  restore: "恢复为候选",
};

type Busy = "merge" | "create" | StatusAction | null;

interface Props {
  items: MethodologyListItemDto[];
  status: MethodologyStatus;
  filtered: boolean;
  totalInStatus: number;
}

export function LibraryList({ items, status, filtered, totalInStatus }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);

  // 列表刷新后已选条目可能已不在当前标签页，按当前列表过滤一遍。
  const selectedIds = items.map((item) => item.id).filter((id) => selected.includes(id));
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggle = (id: string, checked: boolean) =>
    setSelected(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));

  const nameOf = (id: string) => {
    const name = items.find((item) => item.id === id)?.name;
    return name && name.trim() !== "" ? name : "（未命名）";
  };

  async function merge() {
    if (selectedIds.length < 2) return;
    setBusy("merge");
    try {
      const created = await requestJson<MethodologyDetailDto>("/api/methodologies/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
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

  async function runBulk(action: StatusAction) {
    setBusy(action);
    try {
      const result = await requestJson<BulkStatusResultDto>("/api/methodologies/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      const label = ACTION_LABELS[action];
      if (result.failed.length === 0) {
        toast.success(`已${label} ${result.succeeded.length} 个方法论`);
        setSelected([]);
      } else {
        const details = result.failed
          .slice(0, 3)
          .map((failure) => `「${nameOf(failure.id)}」${failure.message}`);
        toast.error(
          `已${label} ${result.succeeded.length} 个，${result.failed.length} 个未改动：${details.join("；")}${
            result.failed.length > 3 ? " 等" : ""
          }`,
        );
        // 保留未改动的条目为选中状态，方便逐个处理后重试。
        setSelected(result.failed.map((failure) => failure.id));
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量处理失败");
    } finally {
      setBusy(null);
    }
  }

  const actionButton = (action: StatusAction, variant: "secondary" | "outline") => (
    <Button
      variant={variant}
      disabled={selectedIds.length === 0 || busy !== null}
      onClick={() => void runBulk(action)}
    >
      {busy === action
        ? `正在${ACTION_LABELS[action]}……`
        : `${ACTION_LABELS[action]}${selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}`}
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={items.length === 0 || allSelected}
            onClick={() => setSelected(items.map((item) => item.id))}
          >
            全选
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={() => setSelected([])}
          >
            全不选
          </Button>
          <span className="text-muted-foreground text-xs">
            已选 {selectedIds.length} / {items.length} 项
          </span>
        </div>
        <Button onClick={() => void create()} disabled={busy !== null}>
          新建方法论
        </Button>
      </div>

      {items.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" ? actionButton("confirm", "secondary") : null}
          {status === "confirmed" ? actionButton("unconfirm", "outline") : null}
          {status === "archived" ? actionButton("restore", "secondary") : null}
          {status !== "archived" ? actionButton("archive", "outline") : null}
          {status === "draft" ? (
            <Button
              variant="outline"
              disabled={selectedIds.length < 2 || busy !== null}
              onClick={() => void merge()}
            >
              {busy === "merge" ? "正在合并……" : `合并所选${selectedIds.length >= 2 ? `（${selectedIds.length}）` : ""}`}
            </Button>
          ) : null}
          {selectedIds.length === 2 ? (
            <Button variant="ghost" asChild>
              <Link href={`/library/compare?a=${selectedIds[0]}&b=${selectedIds[1]}`}>对比所选</Link>
            </Button>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState status={status} filtered={filtered} totalInStatus={totalInStatus} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <Checkbox
                className="mt-1"
                checked={selectedIds.includes(item.id)}
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
