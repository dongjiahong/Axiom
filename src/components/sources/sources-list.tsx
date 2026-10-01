"use client";

import { UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { requestJson } from "@/components/methodology/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SourceListItemDto } from "@/server/dto/source";

import { FORMAT_LABELS, formatCharCount, formatDateTime, SOURCE_STATUS_LABELS } from "./labels";

const ACCEPT = ".epub,.pdf,.txt,.md";

export function SourcesList({ initial }: { initial: SourceListItemDto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<SourceListItemDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await requestJson<{ title: string }>("/api/sources", { method: "POST", body: form });
      toast.success(`已导入《${data.title}》`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await requestJson(`/api/sources/${toDelete.id}`, { method: "DELETE" });
      toast.success("资料已删除");
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-muted" : "hover:bg-muted/50",
        )}
      >
        <UploadCloud className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">{uploading ? "正在导入……" : "点击或拖拽文件到此处上传"}</p>
        <p className="text-muted-foreground text-xs">支持 epub、pdf、txt、md，单个文件不超过 50MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {initial.length === 0 ? (
        <EmptyState>还没有资料，先上传一本书或一段文字稿。</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {initial.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
                    {source.title}
                  </Link>
                  <Badge variant="secondary">{FORMAT_LABELS[source.format]}</Badge>
                  <Badge variant={source.status === "failed" ? "destructive" : "outline"}>
                    {SOURCE_STATUS_LABELS[source.status]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {source.author ? `${source.author} · ` : ""}
                  {formatCharCount(source.charCount)} · {source.chunkCount} 个章节块 ·{" "}
                  {source.draftCount} 个候选方法论 · {source.confirmedCount} 个已确认方法论 ·{" "}
                  {formatDateTime(source.createdAt)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setToDelete(source)}>
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => (open ? null : setToDelete(null))}
        title={`删除《${toDelete?.title ?? ""}》？`}
        description="该资料的候选方法论会一并删除，无法恢复。已确认入库的方法论不受影响。"
        confirmLabel="删除"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
