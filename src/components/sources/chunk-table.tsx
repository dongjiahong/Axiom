"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SourceChunkSummaryDto, SourceChunksBulkSkipDto } from "@/server/dto/source";

import { CHUNK_STATUS_LABELS, formatCharCount } from "./labels";

export function ChunkTable({
  sourceId,
  chunks,
}: {
  sourceId: string;
  chunks: SourceChunkSummaryDto[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [opened, setOpened] = useState<{ title: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const pendingChunks = chunks.filter((chunk) => chunk.extractionStatus === "pending");
  const skippedChunks = chunks.filter((chunk) => chunk.extractionStatus === "skipped");
  const notSkippedCount = chunks.filter((chunk) => chunk.extractionStatus !== "skipped").length;

  async function toggleSkipped(chunk: SourceChunkSummaryDto, skipped: boolean) {
    setPending(chunk.id);
    try {
      const res = await fetch(`/api/sources/${sourceId}/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "操作失败");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setPending(null);
    }
  }

  async function toggleAll(skipped: boolean) {
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}/chunks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped }),
      });
      const data: SourceChunksBulkSkipDto & { error?: { message: string } } = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "操作失败");
      const lockedHint = data.locked > 0 ? `，${data.locked} 个已开始抽取的章节未改动` : "";
      if (data.updated === 0) {
        toast.message(`没有可改动的章节${lockedHint}`);
      } else {
        toast.success(
          skipped
            ? `已跳过 ${data.updated} 个章节${lockedHint}`
            : `已恢复 ${data.updated} 个章节参与抽取${lockedHint}`,
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBulkBusy(false);
    }
  }

  async function openChunk(chunk: SourceChunkSummaryDto) {
    setLoading(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}/chunks/${chunk.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "无法读取正文");
      setOpened({ title: data.title, text: data.text });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "无法读取正文");
    } finally {
      setLoading(false);
    }
  }

  const statusBadge = (chunk: SourceChunkSummaryDto) => (
    <>
      <Badge variant={chunk.extractionStatus === "failed" ? "destructive" : "outline"}>
        {CHUNK_STATUS_LABELS[chunk.extractionStatus as keyof typeof CHUNK_STATUS_LABELS] ??
          chunk.extractionStatus}
      </Badge>
      {chunk.extractionError ? <p className="text-destructive mt-1 text-xs">{chunk.extractionError}</p> : null}
    </>
  );

  const skipSwitch = (chunk: SourceChunkSummaryDto) => (
    <Switch
      checked={chunk.extractionStatus === "skipped"}
      disabled={
        bulkBusy ||
        pending === chunk.id ||
        (chunk.extractionStatus !== "skipped" && chunk.extractionStatus !== "pending")
      }
      onCheckedChange={(value) => void toggleSkipped(chunk, value)}
      aria-label={`跳过 ${chunk.title}`}
    />
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <p className="text-muted-foreground text-xs">
        已选 {notSkippedCount}/{chunks.length} 个章节参与抽取
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={bulkBusy || skippedChunks.length === 0}
          onClick={() => void toggleAll(false)}
        >
          全选
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={bulkBusy || pendingChunks.length === 0}
          onClick={() => void toggleAll(true)}
        >
          全不选
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {toolbar}

      <ul className="divide-y rounded-lg border md:hidden">
        {chunks.map((chunk) => (
          <li key={chunk.id} className="space-y-2 p-3 text-sm">
            <div className="font-medium">
              <span className="text-muted-foreground mr-2 font-normal">{chunk.seq}</span>
              {chunk.title}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground text-xs">{formatCharCount(chunk.charCount)}</span>
              <div>{statusBadge(chunk)}</div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs">
                {skipSwitch(chunk)}
                跳过
              </label>
              <Button variant="ghost" size="sm" disabled={loading} onClick={() => void openChunk(chunk)}>
                查看正文
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">序号</TableHead>
            <TableHead>标题</TableHead>
            <TableHead className="w-24">字数</TableHead>
            <TableHead className="w-28">状态</TableHead>
            <TableHead className="w-24">跳过</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {chunks.map((chunk) => (
            <TableRow key={chunk.id}>
              <TableCell className="text-muted-foreground">{chunk.seq}</TableCell>
              <TableCell className="max-w-md truncate font-medium" title={chunk.title}>
                {chunk.title}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatCharCount(chunk.charCount)}</TableCell>
              <TableCell>{statusBadge(chunk)}</TableCell>
              <TableCell>{skipSwitch(chunk)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => void openChunk(chunk)}
                >
                  查看正文
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <Sheet open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{opened?.title}</SheetTitle>
            <SheetDescription>章节块正文（供后续抽取核对原文使用）</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] px-4">
            <pre className="text-sm break-words whitespace-pre-wrap">{opened?.text}</pre>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
