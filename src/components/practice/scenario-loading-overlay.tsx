"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SCENARIO_LOADING_MESSAGE_INTERVAL_MS, SCENARIO_LOADING_TICK_MS } from "@/domain/constants";

import { SCENARIO_LOADING_MESSAGES } from "./labels";

/**
 * 生成场景期间的全屏遮罩：盖住侧栏与顶栏，不能切换页面或点击其他入口。
 * 等待时轮播阶段文案并显示已等待秒数，避免长时间的静态加载让人以为卡住。
 */
export function ScenarioLoadingOverlay() {
  const [step, setStep] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const messages = setInterval(() => {
      setStep((current) => (current + 1) % SCENARIO_LOADING_MESSAGES.length);
    }, SCENARIO_LOADING_MESSAGE_INTERVAL_MS);
    const clock = setInterval(() => {
      setSeconds((current) => current + 1);
    }, SCENARIO_LOADING_TICK_MS);
    return () => {
      clearInterval(messages);
      clearInterval(clock);
    };
  }, []);

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
          {SCENARIO_LOADING_MESSAGES[step]}
        </DialogTitle>
        <DialogDescription>
          AI 正在设计这场练习，通常需要 60–180 秒。请稍等，不要关闭页面。
        </DialogDescription>
        <p className="text-muted-foreground text-sm tabular-nums">已等待 {seconds} 秒</p>
      </DialogContent>
    </Dialog>
  );
}
