"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MergeSuggestionDto } from "@/server/dto/extraction";
import type { MethodologyDetailDto } from "@/server/dto/methodology";

/** 合并建议：接受 = 让 AI 合并成员并归档原候选方法论；忽略 = 保留现状。 */
export function MergeSuggestionList({ suggestions }: { suggestions: MergeSuggestionDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ id: string; action: "accept" | "dismiss" } | null>(null);

  async function act(suggestion: MergeSuggestionDto, action: "accept" | "dismiss") {
    setBusy({ id: suggestion.id, action });
    try {
      const result = await requestJson<MethodologyDetailDto | { dismissed: true }>(
        `/api/merge-suggestions/${suggestion.id}/${action}`,
        { method: "POST" },
      );
      toast.success(action === "accept" && "name" in result ? `已合并为「${result.name}」` : "已忽略这条建议");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y rounded-lg border">
      {suggestions.map((suggestion) => {
        const working = busy?.id === suggestion.id;
        return (
          <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {suggestion.members.map((member) => (
                  <Link key={member.id} href={`/library/${member.id}`}>
                    <Badge variant="secondary">{member.name}</Badge>
                  </Link>
                ))}
              </div>
              <p className="text-muted-foreground text-sm">{suggestion.reason}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => void act(suggestion, "accept")}>
                {working && busy?.action === "accept" ? "合并中……" : "接受合并"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(suggestion, "dismiss")}>
                忽略
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
