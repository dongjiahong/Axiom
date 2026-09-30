"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";
import type { Difficulty } from "@/domain/schemas";

/** 复盘页与历史页的练习入口。 */

/** 再练一次：以同一场景新建一场练习，模式沿用该场景上一次的练习。 */
export function RetryButton({
  scenarioId,
  variant = "outline",
  size = "default",
}: {
  scenarioId: string;
  variant?: "default" | "outline";
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const { sessionId } = await requestJson<{ sessionId: string }>(
        `/api/scenarios/${scenarioId}/retry`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      router.push(`/practice/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "无法再练一次");
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} disabled={busy} onClick={() => void retry()}>
      {busy ? "正在准备……" : "再练一次"}
    </Button>
  );
}

/** 换个场景练同一方法论：以刚练过的方法论为指定目标，生成一个新场景。 */
export function SwitchMethodologyButton({
  methodologyId,
  difficulty,
}: {
  methodologyId: string;
  difficulty: Difficulty;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const { sessionId } = await requestJson<{ sessionId: string }>("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: "pick",
          methodologyId,
          scope: { tagIds: [], sourceIds: [] },
          difficulty,
        }),
      });
      router.push(`/practice/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成场景失败");
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" disabled={busy} onClick={() => void start()}>
      {busy ? "正在设计场景……" : "换个场景练同一方法论"}
    </Button>
  );
}
