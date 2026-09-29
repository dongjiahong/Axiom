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
import type { SourceChunkSummaryDto } from "@/server/dto/source";

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
  const [opened, setOpened] = useState<{ title: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

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
        pending === chunk.id ||
        (chunk.extractionStatus !== "skipped" && chunk.extractionStatus !== "pending")
      }
      onCheckedChange={(value) => void toggleSkipped(chunk, value)}
      aria-label={`跳过 ${chunk.title}`}
    />
  );

  return (
    <>
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
