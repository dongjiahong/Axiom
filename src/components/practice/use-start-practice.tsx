"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import type { Difficulty, Scope, SelectionMode } from "@/domain/schemas";

import { AiLoadingOverlay } from "./ai-loading-overlay";

export interface StartPracticeParams {
  selection: SelectionMode;
  methodologyId?: string;
  scope: Scope;
  difficulty: Difficulty;
}

/** 指定某个方法论开始练习时的范围（不限标签与资料）。 */
export const OPEN_SCOPE: Scope = { tagIds: [], sourceIds: [] };

/**
 * 所有「开始练习」入口共用：生成场景 → 跳转到练习页。
 * 等待期间渲染 `overlay`（全屏遮罩），失败时用 toast 提示并恢复可点击。
 */
export function useStartPractice(): {
  start: (params: StartPracticeParams) => Promise<boolean>;
  busy: boolean;
  overlay: ReactNode;
} {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start(params: StartPracticeParams): Promise<boolean> {
    setBusy(true);
    try {
      const { sessionId } = await requestJson<{ sessionId: string }>("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      router.push(`/practice/${sessionId}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成场景失败");
      setBusy(false);
      return false;
    }
  }

  return { start, busy, overlay: busy ? <AiLoadingOverlay kind="scenario" /> : null };
}
