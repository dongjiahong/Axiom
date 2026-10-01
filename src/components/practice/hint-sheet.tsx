"use client";

import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MethodologySkeletonDto } from "@/server/dto/session";

import { MethodologySkeletonView } from "./methodology-skeleton";

/**
 * 练习中查看方法论骨架的抽屉（准备页与对话页共用）。
 * 第一次打开时请求提示接口（服务端据此记录“查看过提示”），之后复用已取到的内容。
 */
export function useHintSheet(sessionId: string) {
  const [open, setOpen] = useState(false);
  const [skeleton, setSkeleton] = useState<MethodologySkeletonDto | null>(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setOpen(true);
    if (skeleton || loading) return;
    setLoading(true);
    try {
      setSkeleton(
        await requestJson<MethodologySkeletonDto>(`/api/sessions/${sessionId}/hint`, { method: "POST" }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取失败");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{skeleton?.name ?? "方法论骨架"}</SheetTitle>
          <SheetDescription>已记录为“查看过提示”，统计中会区分。</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {skeleton ? <MethodologySkeletonView skeleton={skeleton} /> : <p className="text-sm">加载中……</p>}
        </div>
      </SheetContent>
    </Sheet>
  );

  return { show, loading, sheet };
}
