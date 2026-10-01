"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";

/** 再练一次：以同一场景新建一场练习（复盘页与历史页共用）。 */
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
