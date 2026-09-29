"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";

import { findText } from "@/domain/text-match";
import type { SourceExcerpt } from "@/domain/schemas";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { OriginChunkDto } from "@/server/dto/methodology";

/** 原文摘录的核对徽章与原文抽屉。 */

export interface ExcerptNode {
  excerpt: SourceExcerpt | null;
  inferred: boolean;
}

export function ExcerptBadge({
  node,
  onOpen,
}: {
  node: ExcerptNode;
  onOpen: (excerpt: SourceExcerpt) => void;
}) {
  if (node.inferred) return <Badge variant="secondary">AI 推断</Badge>;
  const excerpt = node.excerpt;
  if (!excerpt) return null;

  const label =
    excerpt.match === "exact" ? "原文已核对" : excerpt.match === "fuzzy" ? "原文近似匹配" : "未在原文中找到";
  return (
    <button type="button" onClick={() => onOpen(excerpt)} className="rounded-full" title="查看原文">
      <Badge
        variant="outline"
        className={
          excerpt.match === "none"
            ? "border-amber-500 text-amber-600"
            : excerpt.match === "exact"
              ? "border-emerald-500 text-emerald-600"
              : "border-sky-500 text-sky-600"
        }
      >
        {label}
      </Badge>
    </button>
  );
}

async function fetchChunk(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "无法读取原文");
  return data;
}

export function ExcerptDrawer({
  excerpt,
  originChunks,
  onClose,
}: {
  excerpt: SourceExcerpt | null;
  originChunks: OriginChunkDto[];
  onClose: () => void;
}) {
  const chunk = excerpt?.chunkId ? originChunks.find((c) => c.id === excerpt.chunkId) : undefined;
  const { data, error, isLoading } = useSWR(
    chunk ? `/api/sources/${chunk.sourceId}/chunks/${chunk.id}` : null,
    fetchChunk,
  );

  // 摘录核对成功时 excerpt.text 已是原文真实片段；用同一套归一化匹配兜底定位。
  const hit = excerpt && data ? findText(excerpt.text, [{ id: "chunk", text: data.text }]) : null;
  const start = hit && data ? data.text.indexOf(hit.text) : -1;
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, [data, start]);

  return (
    <Sheet open={excerpt !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{chunk?.title ?? "原文摘录"}</SheetTitle>
          <SheetDescription>核对 AI 是否编造或曲解了原文。高亮处为这条内容对应的原文。</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] px-4">
          {excerpt && !chunk ? (
            <div className="space-y-2 text-sm">
              <p className="text-amber-600">
                {excerpt.match === "none"
                  ? "未能在来源章节中找到这段摘录，可能是 AI 编造或曲解，请对照原书核实。"
                  : "找不到这段摘录所在的章节（资料可能已被删除）。"}
              </p>
              <p className="bg-muted rounded-md p-3">{excerpt.text}</p>
            </div>
          ) : isLoading ? (
            <p className="text-muted-foreground text-sm">正在读取原文……</p>
          ) : error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : data ? (
            <pre className="text-sm break-words whitespace-pre-wrap">
              {start >= 0 && hit ? (
                <>
                  {data.text.slice(0, start)}
                  <mark ref={markRef} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700/60">
                    {hit.text}
                  </mark>
                  {data.text.slice(start + hit.text.length)}
                </>
              ) : (
                data.text
              )}
            </pre>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
