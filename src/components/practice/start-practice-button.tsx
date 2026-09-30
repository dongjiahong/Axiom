"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Difficulty } from "@/domain/schemas";

import { DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS } from "./labels";
import { ScenarioLoadingOverlay } from "./scenario-loading-overlay";

/** 方法论详情页的练习入口：先选难度，再生成场景，等待体验与练习页一致。 */
export function StartPracticeButton({ methodologyId }: { methodologyId: string }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("neutral");
  const [busy, setBusy] = useState(false);

  async function start() {
    setPicking(false);
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
    <>
      <Button type="button" disabled={busy} onClick={() => setPicking(true)}>
        开始练习
      </Button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>开始练习</DialogTitle>
            <DialogDescription>选好难度后，AI 会围绕这个方法设计一个场景。</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={difficulty}
            onValueChange={(value) => setDifficulty(value as Difficulty)}
            className="grid gap-3"
          >
            {(["cooperative", "neutral", "tough"] as const).map((d) => (
              <label
                key={d}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  difficulty === d ? "border-primary bg-muted/50" : ""
                }`}
              >
                <RadioGroupItem value={d} className="mt-1" />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{DIFFICULTY_LABELS[d]}</span>
                  <span className="text-muted-foreground block text-xs">{DIFFICULTY_DESCRIPTIONS[d]}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicking(false)}>
              再想想
            </Button>
            <Button onClick={() => void start()}>生成场景</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {busy ? <ScenarioLoadingOverlay /> : null}
    </>
  );
}
