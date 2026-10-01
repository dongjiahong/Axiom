"use client";

import { useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Difficulty } from "@/domain/schemas";

import { DifficultyPicker } from "./difficulty-picker";
import { OPEN_SCOPE, useStartPractice } from "./use-start-practice";

/**
 * 针对某个方法论开始练习：先选难度，再生成场景。
 * 受控使用（`open`）可从菜单等处触发；`defaultDifficulty` 用于沿用上一场的难度。
 */
export function StartPracticeDialog({
  methodologyId,
  open,
  onOpenChange,
  defaultDifficulty = "neutral",
}: {
  methodologyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDifficulty?: Difficulty;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>(defaultDifficulty);
  const { start, overlay } = useStartPractice();

  async function submit() {
    onOpenChange(false);
    await start({ selection: "pick", methodologyId, scope: OPEN_SCOPE, difficulty });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>开始练习</DialogTitle>
            <DialogDescription>选好难度后，AI 会围绕这个方法论设计一个场景。</DialogDescription>
          </DialogHeader>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              再想想
            </Button>
            <Button onClick={() => void submit()}>生成场景</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {overlay}
    </>
  );
}

/** 自带弹窗的练习按钮：方法论详情、首页「最需要练习」共用。 */
export function StartPracticeButton({
  methodologyId,
  label = "开始练习",
  defaultDifficulty,
  ...buttonProps
}: {
  methodologyId: string;
  label?: string;
  defaultDifficulty?: Difficulty;
} & Pick<ComponentProps<typeof Button>, "variant" | "size">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <StartPracticeDialog
        methodologyId={methodologyId}
        open={open}
        onOpenChange={setOpen}
        defaultDifficulty={defaultDifficulty}
      />
    </>
  );
}
