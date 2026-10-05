"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";

import { AiLoadingOverlay } from "./ai-loading-overlay";

/**
 * 练习结束后触发复盘（可能需要 30–120 秒）。
 * `auto` 为 true 时进入页面即开始；上次失败（debrief_failed）时等用户点“重试复盘”。
 */
export function DebriefTrigger({ sessionId, auto }: { sessionId: string; auto: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "failed">(auto ? "running" : "idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setState("running");
    setError(null);
    try {
      await requestJson(`/api/sessions/${sessionId}/debrief`, { method: "POST" });
      router.push(`/practice/${sessionId}/debrief`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复盘失败");
      setState("failed");
    }
  }

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "running") {
    return (
      <>
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">正在复盘……</div>
        <AiLoadingOverlay kind="debrief" />
      </>
    );
  }
  return (
    <div className="space-y-2 bg-card rounded-xl border p-6 text-sm">
      {error ? <p className="text-destructive">复盘失败：{error}</p> : <p>练习已结束，可以开始复盘。</p>}
      <Button onClick={() => void run()}>{state === "failed" ? "重试复盘" : "开始复盘"}</Button>
    </div>
  );
}
