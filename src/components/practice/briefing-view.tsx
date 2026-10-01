"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionDto } from "@/server/dto/session";

import { useHintSheet } from "./hint-sheet";
import { ScenarioCard } from "./scenario-card";

export function BriefingView({ session }: { session: SessionDto }) {
  const router = useRouter();
  const hint = useHintSheet(session.id);
  const [busy, setBusy] = useState<"start" | "abandon" | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  async function start() {
    setBusy("start");
    try {
      await requestJson(`/api/sessions/${session.id}/start`, { method: "POST" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "开始失败");
      setBusy(null);
    }
  }

  async function abandon() {
    setBusy("abandon");
    try {
      await requestJson(`/api/sessions/${session.id}`, { method: "DELETE" });
      toast.info("已放弃这场练习");
      router.push("/practice/new");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "放弃失败");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <ScenarioCard session={session} showTitle={false} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">目标方法论：{session.targetMethodologyName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void hint.show()} disabled={hint.loading}>
            查看方法论骨架
          </Button>
          <span className="text-muted-foreground text-xs">
            查看后会在统计中标记为“看着做”，掌握度也会相应折算。
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void start()} disabled={busy !== null}>
          {busy === "start" ? "正在开始……" : "开始对话"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmAbandon(true)} disabled={busy !== null}>
          放弃这场练习
        </Button>
      </div>

      {hint.sheet}

      <ConfirmDialog
        open={confirmAbandon}
        onOpenChange={setConfirmAbandon}
        title="放弃这场练习？"
        description="场景不会保留在历史里。想以后再练，可以重新生成场景。"
        confirmLabel="放弃"
        destructive
        busy={busy === "abandon"}
        onConfirm={() => void abandon()}
      />
    </div>
  );
}
