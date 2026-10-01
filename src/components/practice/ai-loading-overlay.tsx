"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SCENARIO_LOADING_MESSAGE_INTERVAL_MS, SCENARIO_LOADING_TICK_MS } from "@/domain/constants";

import { DEBRIEF_LOADING_MESSAGES, SCENARIO_LOADING_MESSAGES } from "./labels";

const KINDS = {
  scenario: {
    messages: SCENARIO_LOADING_MESSAGES,
    description: "AI 正在设计这场练习，通常需要 60–180 秒。请稍等，不要关闭页面。",
  },
  debrief: {
    messages: DEBRIEF_LOADING_MESSAGES,
    description: "AI 正在复盘这场练习，通常需要 30–120 秒。请稍等，不要关闭页面。",
  },
} as const;

/**
 * AI 长耗时任务（生成场景、复盘）期间的全屏遮罩：盖住侧栏与顶栏，不能切换页面或点击其他入口。
 * 等待时轮播阶段文案并显示已等待秒数，避免长时间的静态加载让人以为卡住。
 */
export function AiLoadingOverlay({ kind }: { kind: keyof typeof KINDS }) {
  const { messages, description } = KINDS[kind];
  const [step, setStep] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const rotate = setInterval(() => {
      setStep((current) => (current + 1) % messages.length);
    }, SCENARIO_LOADING_MESSAGE_INTERVAL_MS);
    const clock = setInterval(() => {
      setSeconds((current) => current + 1);
    }, SCENARIO_LOADING_TICK_MS);
    return () => {
      clearInterval(rotate);
      clearInterval(clock);
    };
  }, [messages.length]);

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        aria-busy
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="max-w-[calc(100%-2rem)] justify-items-center gap-3 p-8 text-center sm:max-w-md"
      >
        <Loader2Icon aria-hidden className="text-primary size-12 animate-spin" />
        <DialogTitle key={step} className="animate-in fade-in text-lg font-medium duration-300">
          {messages[step]}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <p className="text-muted-foreground text-sm tabular-nums">已等待 {seconds} 秒</p>
      </DialogContent>
    </Dialog>
  );
}
