"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { MethodologySkeletonDto, SessionDto } from "@/server/dto/session";

import { ScenarioCard } from "./scenario-card";

export function Skeleton({ skeleton }: { skeleton: MethodologySkeletonDto }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">{skeleton.summary}</p>
      <div>
        <h4 className="font-medium">适用条件</h4>
        <ul className="text-muted-foreground list-disc pl-5">
          {skeleton.applicability.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <h4 className="font-medium">
          步骤 <span className="text-muted-foreground font-normal">（{skeleton.orderMode === "strict" ? "严格顺序" : "顺序不敏感"}）</span>
        </h4>
        {skeleton.steps.map((step, i) => (
          <div key={i} className="rounded-md border p-3">
            <div className="flex items-center gap-2 font-medium">
              {i + 1}. {step.title}
              {step.conditional ? <Badge variant="outline">条件步骤</Badge> : null}
            </div>
            {step.conditional && step.trigger ? (
              <p className="text-muted-foreground text-xs">触发：{step.trigger}</p>
            ) : null}
            <ul className="text-muted-foreground mt-1 list-disc pl-5">
              {step.keyPoints.map((text, j) => (
                <li key={j}>{text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {skeleton.principles.length > 0 ? (
        <div>
          <h4 className="font-medium">原则</h4>
          <ul className="text-muted-foreground list-disc pl-5">
            {skeleton.principles.map((p, i) => (
              <li key={i}>
                {p.kind === "do" ? "要做：" : "禁忌："}
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BriefingView({ session }: { session: SessionDto }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(session.selectedMethodologyId);
  const [skeleton, setSkeleton] = useState<MethodologySkeletonDto | null>(null);
  const [busy, setBusy] = useState<"hint" | "start" | "select" | null>(null);
  const post = <T,>(action: string, body?: unknown) =>
    requestJson<T>(`/api/sessions/${session.id}/${action}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });

  async function showHint() {
    setBusy("hint");
    try {
      setSkeleton(await post<MethodologySkeletonDto>("hint"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取失败");
    } finally {
      setBusy(null);
    }
  }

  async function choose(methodologyId: string) {
    const previous = selectedId;
    setSelectedId(methodologyId);
    setBusy("select");
    try {
      await post("select", { methodologyId });
    } catch (err) {
      setSelectedId(previous);
      toast.error(err instanceof Error ? err.message : "选择失败");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setBusy("start");
    try {
      await post("start");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "开始失败");
      setBusy(null);
    }
  }

  const isQuiz = session.mode === "quiz";

  return (
    <div className="space-y-4">
      <ScenarioCard session={session} />

      {isQuiz ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">选择你要使用的方法论</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              根据场景判断哪个方法论最合适。开始后不能修改；对话结束后会评判你的选择是否恰当。
            </p>
            <RadioGroup
              value={selectedId ?? ""}
              onValueChange={(value) => void choose(value)}
              className="gap-2"
            >
              {(session.candidates ?? []).map((candidate) => (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                    selectedId === candidate.id ? "border-primary bg-muted/50" : ""
                  }`}
                >
                  <RadioGroupItem value={candidate.id} />
                  <span className="text-sm font-medium">{candidate.name}</span>
                  {candidate.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              目标方法论：{session.targetMethodologyName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => void showHint()} disabled={busy === "hint"}>
                {skeleton ? "刷新方法论骨架" : "查看方法论骨架"}
              </Button>
              <span className="text-muted-foreground text-xs">
                查看后会在统计中标记为“看着做”，掌握度也会相应折算。
              </span>
            </div>
            {skeleton ? <Skeleton skeleton={skeleton} /> : null}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => void start()} disabled={busy !== null || (isQuiz && !selectedId)}>
          {busy === "start" ? "正在开始……" : "开始对话"}
        </Button>
        {isQuiz && !selectedId ? (
          <span className="text-muted-foreground text-sm">请先选择一个方法论</span>
        ) : null}
      </div>
    </div>
  );
}
