"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
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

import { CREATED_BY_LABELS, requestJson } from "./labels";

/** 批量状态迁移时的按钮文案。 */
const ACTION_LABELS: Record<StatusAction, string> = {
  confirm: "确认入库",
  unconfirm: "退回候选",
  archive: "归档",
  restore: "恢复为候选",
};

type Busy = "merge" | "create" | "delete" | StatusAction | null;

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
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setConfirmArchive(false);
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

  async function runDelete() {
    setConfirmDelete(false);
    setBusy("delete");
    const failed: { id: string; message: string }[] = [];
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await requestJson(`/api/methodologies/${id}`, { method: "DELETE" });
        deleted += 1;
      } catch (err) {
        failed.push({ id, message: err instanceof Error ? err.message : "删除失败" });
      }
    }
    if (failed.length === 0) {
      toast.success(`已删除 ${deleted} 个方法论`);
      setSelected([]);
    } else {
      const details = failed.slice(0, 3).map((failure) => `「${nameOf(failure.id)}」${failure.message}`);
      toast.error(
        `已删除 ${deleted} 个，${failed.length} 个未删除：${details.join("；")}${failed.length > 3 ? " 等" : ""}`,
      );
      setSelected(failed.map((failure) => failure.id));
    }
    router.refresh();
    setBusy(null);
  }

  const actionButton = (action: StatusAction, variant: "secondary" | "outline") => (
    <Button
      size="sm"
      variant={variant}
      disabled={busy !== null}
      onClick={() => (action === "archive" ? setConfirmArchive(true) : void runBulk(action))}
    >
      {busy === action ? `正在${ACTION_LABELS[action]}……` : `${ACTION_LABELS[action]}（${selectedIds.length}）`}
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
        <Button size="sm" onClick={() => void create()} disabled={busy !== null}>
          新建方法论
        </Button>
      </div>

      {selectedIds.length === 0 ? null : (
        // 选中后固定在窗口底部，长列表里滚动时操作也不会离开视野
        <div className="bg-background sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t px-4 py-2 md:-mx-6 md:px-6">
          {status === "draft" ? actionButton("confirm", "secondary") : null}
          {status === "confirmed" ? actionButton("unconfirm", "outline") : null}
          {status === "archived" ? actionButton("restore", "secondary") : null}
          {status !== "archived" ? actionButton("archive", "outline") : null}
          {status === "archived" ? (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              {busy === "delete" ? "正在删除……" : `删除（${selectedIds.length}）`}
            </Button>
          ) : null}
          {status === "draft" && selectedIds.length >= 2 ? (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void merge()}>
              {busy === "merge" ? "正在合并……" : `合并所选（${selectedIds.length}）`}
            </Button>
          ) : null}
          {selectedIds.length === 2 ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/library/compare?a=${selectedIds[0]}&b=${selectedIds[1]}`}>对比所选</Link>
            </Button>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyHint status={status} filtered={filtered} totalInStatus={totalInStatus} />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
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
                  {item.inferredCount > 0 ? <span>{item.inferredCount} 处 AI 推断</span> : null}
                  {item.unmatchedExcerptCount > 0 ? (
                    <span className="text-warning">{item.unmatchedExcerptCount} 处摘录未匹配</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`归档所选的 ${selectedIds.length} 个方法论？`}
        description="归档后不能用于出题，历史练习和统计不受影响，可以随时恢复。"
        confirmLabel="归档"
        onConfirm={() => void runBulk("archive")}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`永久删除所选的 ${selectedIds.length} 个方法论？`}
        description="删除后无法恢复。已经出过题的方法论不能删除，会保留在归档里。"
        confirmLabel="删除"
        destructive
        onConfirm={() => void runDelete()}
      />
    </div>
  );
}

function EmptyHint({
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
    <EmptyState
      action={
        action ? (
          <Button variant="outline" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : null
      }
    >
      {text}
    </EmptyState>
  );
}
