"use client";

import { Skeleton } from "@/components/practice/briefing-view";
import { ScenarioCard } from "@/components/practice/scenario-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MethodologySkeletonDto, SessionDto } from "@/server/dto/session";

/** 复盘后揭晓的完整设定：场景卡 + 对方角色卡 + 场景设计说明。 */
export function ScenarioDetailDialog({
  session,
  stepTitle,
  open,
  onOpenChange,
}: {
  session: SessionDto;
  stepTitle: (id: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const brief = session.brief;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>构建的场景</DialogTitle>
          <DialogDescription>练习结束后揭晓的完整设定，含对方隐藏的立场与计划阻力。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ScenarioCard session={session} />

          {brief ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">对方角色卡</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <section className="space-y-1">
                  <h3 className="font-medium">性格</h3>
                  <p className="text-muted-foreground">{brief.personality}</p>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">真实立场</h3>
                  <p className="text-muted-foreground">{brief.trueStance}</p>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">隐藏顾虑</h3>
                  <ul className="text-muted-foreground list-disc pl-5">
                    {brief.hiddenConcerns.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">计划阻力</h3>
                  <ul className="space-y-1">
                    {brief.plannedResistance.map((item) => (
                      <li key={item.id}>
                        <span className="font-medium">{item.trigger}</span> → {item.reaction}
                        {item.linkedStepId ? (
                          <span className="text-muted-foreground">（针对步骤「{stepTitle(item.linkedStepId)}」）</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">让步条件</h3>
                  <p className="text-muted-foreground">{brief.yieldConditions}</p>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">崩盘条件</h3>
                  <p className="text-muted-foreground">{brief.breakdownConditions}</p>
                </section>
              </CardContent>
            </Card>
          ) : null}

          {session.designNotes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">场景设计说明</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-muted-foreground">{session.designNotes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 本场练习冻结的方法论快照骨架：后续对方法论的修改不影响它。 */
export function MethodologySnapshotDialog({
  name,
  version,
  skeleton,
  open,
  onOpenChange,
}: {
  name: string;
  version: number;
  skeleton: MethodologySkeletonDto | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            这是本场练习用的版本 {version} 快照，之后对方法论的修改不影响这次评判。
          </DialogDescription>
        </DialogHeader>
        {skeleton ? (
          <Skeleton skeleton={skeleton} />
        ) : (
          <p className="text-muted-foreground text-sm">这场练习没有保存方法论快照，无法展示。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
