"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { DIFFICULTY_LABELS } from "@/components/practice/labels";
import { RetryButton } from "@/components/practice/practice-actions";
import { StartPracticeDialog } from "@/components/practice/start-practice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { QUALITY_RANGE } from "@/domain/constants";
import { useMediaQuery } from "@/lib/use-media-query";
import type { KeyPointVerdictValue, PrincipleVerdictValue } from "@/domain/schemas";
import type { DebriefDto, OverrideResultDto, VerdictDto } from "@/server/dto/debrief";

import { OUTCOME_LABELS, stars, VERDICT_LABELS, VERDICT_STYLES } from "./labels";
import { MethodologySnapshotDialog, ScenarioDetailDialog } from "./session-dialogs";

type AnyVerdict = KeyPointVerdictValue | PrincipleVerdictValue;

interface ActiveEvidence {
  turn: number;
  quote: string;
  /** 每次点击递增，使同一条证据重复点击也能重新滚动。 */
  nonce: number;
}

/** 把改判结果合并回本地复盘数据。 */
function applyOverrideResult(dto: DebriefDto, result: OverrideResultDto): DebriefDto {
  const replace = (v: VerdictDto) => (v.id === result.verdict.id ? result.verdict : v);
  const breakdownSteps = new Map(result.scoreBreakdown.steps.map((s) => [s.stepId, s]));
  return {
    ...dto,
    executionScore: result.executionScore,
    scoreBreakdown: result.scoreBreakdown,
    steps: dto.steps.map((step) => ({
      ...step,
      included: breakdownSteps.get(step.id)?.included ?? step.included,
      value: breakdownSteps.get(step.id)?.value ?? null,
      keyPoints: step.keyPoints.map(replace),
    })),
    principles: dto.principles.map((p) => (p.id === result.verdict.id ? { ...p, ...result.verdict } : p)),
  };
}

export function DebriefView({ initial }: { initial: DebriefDto }) {
  const [dto, setDto] = useState(initial);
  const [active, setActive] = useState<ActiveEvidence | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<VerdictDto | null>(null);
  const [showConversation, setShowConversation] = useState(true);
  const [conversationSheetOpen, setConversationSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<"scenario" | "methodology" | "restart" | null>(null);
  // 与 lg 断点一致：大屏对话在右侧栏，小屏在底部抽屉。
  const sideBySide = useMediaQuery("(min-width: 1024px)");
  const nonce = useRef(0);

  const conceptById = useMemo(() => new Map(dto.concepts.map((c) => [c.id, c])), [dto.concepts]);
  const stepTitle = (id: string) => dto.steps.find((s) => s.id === id)?.title ?? "";

  function focusEvidence(turn: number, quote: string, matched: boolean) {
    if (sideBySide) setShowConversation(true);
    else setConversationSheetOpen(true);
    setActive({ turn, quote: matched ? quote : "", nonce: ++nonce.current });
  }

  async function removeOverride(verdict: VerdictDto) {
    try {
      const result = await requestJson<OverrideResultDto>(`/api/verdicts/${verdict.id}/override`, {
        method: "DELETE",
      });
      setDto((prev) => applyOverrideResult(prev, result));
      toast.success("已撤销改判");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "撤销失败");
    }
  }

  const { scoreBreakdown } = dto;
  const violatedPrinciples = dto.principles.filter((p) => scoreBreakdown.violatedPrincipleIds.includes(p.refId));

  const cardProps = { onEvidence: focusEvidence, onOverride: setOverrideTarget, onUndo: removeOverride, conceptById };

  return (
    <div className="space-y-4">
      {/* 标题与操作固定在顶部：向下滚动时复盘入口始终可见 */}
      <div className="bg-background sticky top-12 z-30 -mx-4 flex items-center justify-between gap-2 border-b px-4 py-3 md:top-0 md:-mx-6 md:px-6">
        <h1 className="text-2xl font-semibold">复盘</h1>
        <div className="flex flex-wrap gap-2">
          <RetryButton scenarioId={dto.session.scenario.id} variant="default" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Ellipsis />
                更多
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setDialog("scenario")}>查看场景</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("methodology")}>查看方法论</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("restart")}>换个场景再练</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/practice/new">开始新的练习</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/history">返回历史</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Button variant="outline" className="w-full lg:hidden" onClick={() => setConversationSheetOpen(true)}>
            查看完整对话
          </Button>

          {/* 头部 */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">{dto.session.scenario.title}</CardTitle>
                <Badge variant="outline">难度：{DIFFICULTY_LABELS[dto.difficulty]}</Badge>
                <Badge variant="outline">{dto.hintUsed ? "查看过提示" : "未查看提示"}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">所用方法论：{dto.selected.name}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-muted-foreground text-xs">执行分</div>
                  <div className="text-5xl font-semibold tabular-nums" data-testid="execution-score">
                    {dto.executionScore}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">整体印象分</div>
                  <div className="text-2xl tabular-nums">{dto.holisticScore}</div>
                  <div className="text-muted-foreground text-xs">AI 整体印象，仅供参考，不计入统计</div>
                </div>
                <div className="min-w-40">
                  <div className="text-muted-foreground text-xs">说服结果</div>
                  <div>{OUTCOME_LABELS[dto.outcome]}</div>
                  <div className="text-muted-foreground text-xs">{dto.outcomeNote}</div>
                </div>
              </div>
              <p className="text-sm">{dto.holisticComment}</p>
            </CardContent>
          </Card>

          {/* 总结 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">总结</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <div className="font-medium">做得好的地方</div>
                {dto.summary.strengths.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {dto.summary.strengths.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">暂无</p>
                )}
              </div>
              <div>
                <div className="font-medium">最重要的改进点</div>
                <ol className="list-decimal pl-5">
                  {dto.summary.improvements.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* 扣分项 */}
          {violatedPrinciples.length > 0 || scoreBreakdown.orderViolation ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">扣分项</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {violatedPrinciples.length > 0 ? (
                  <p>违反原则：{violatedPrinciples.map((p) => `「${p.text}」`).join("、")}（扣 {scoreBreakdown.principlePenalty} 分）</p>
                ) : null}
                {scoreBreakdown.orderViolation ? (
                  <p>
                    错序：「{stepTitle(scoreBreakdown.orderViolation.laterStepId)}」出现在「
                    {stepTitle(scoreBreakdown.orderViolation.earlierStepId)}」之前（扣 {scoreBreakdown.orderPenalty} 分）
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* 步骤与要点 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">步骤与要点</h2>
            {dto.steps.map((step, index) =>
              step.included ? (
                <Card key={step.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {index + 1}. {step.title}
                      {step.conditional ? <Badge variant="outline">条件步骤</Badge> : null}
                      {step.value !== null ? (
                        <span className="text-muted-foreground text-xs font-normal">本步骤 {step.value} 分</span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {step.keyPoints.map((kp) => (
                      <VerdictCard key={kp.id} verdict={kp} {...cardProps} />
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <details key={step.id} className="bg-card rounded-xl border p-3 text-sm">
                  <summary className="cursor-pointer">
                    {index + 1}. {step.title}
                    <span className="text-muted-foreground ml-2">本场未触发（{step.trigger}）</span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    {step.keyPoints.map((kp) => (
                      <VerdictCard key={kp.id} verdict={kp} {...cardProps} />
                    ))}
                  </div>
                </details>
              ),
            )}
          </section>

          {/* 原则 */}
          {dto.principles.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">原则</h2>
              <Card>
                <CardContent className="space-y-3 pt-4">
                  {dto.principles.map((p) => (
                    <VerdictCard key={p.id} verdict={p} {...cardProps} />
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}

        </div>

        {/* 完整对话 */}
        {sideBySide ? (
          <aside className="sticky top-20 self-start">
            <div className="flex items-center justify-between pb-2">
              <h2 className="font-semibold">完整对话</h2>
              <Button size="sm" variant="ghost" onClick={() => setShowConversation((v) => !v)}>
                {showConversation ? "折叠" : "展开"}
              </Button>
            </div>
            {showConversation ? <Conversation dto={dto} active={active} /> : null}
          </aside>
        ) : null}
      </div>

      <Sheet open={!sideBySide && conversationSheetOpen} onOpenChange={setConversationSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-0">
          <SheetHeader>
            <SheetTitle>完整对话</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <Conversation dto={dto} active={active} className="max-h-[70vh]" />
          </div>
        </SheetContent>
      </Sheet>

      <OverrideDialog
        target={overrideTarget}
        conditional={
          overrideTarget?.kind === "key_point" &&
          dto.steps.some((s) => s.conditional && s.keyPoints.some((k) => k.id === overrideTarget.id))
        }
        onClose={() => setOverrideTarget(null)}
        onSaved={(result) => {
          setDto((prev) => applyOverrideResult(prev, result));
          setOverrideTarget(null);
          toast.success("已改判，执行分已更新");
        }}
      />

      <StartPracticeDialog
        methodologyId={dto.selected.methodologyId}
        defaultDifficulty={dto.difficulty}
        open={dialog === "restart"}
        onOpenChange={(open) => setDialog(open ? "restart" : null)}
      />
      <ScenarioDetailDialog
        session={dto.session}
        stepTitle={stepTitle}
        open={dialog === "scenario"}
        onOpenChange={(open) => setDialog(open ? "scenario" : null)}
      />
      <MethodologySnapshotDialog
        name={dto.selected.name}
        version={dto.selected.version}
        skeleton={dto.session.targetSkeleton}
        open={dialog === "methodology"}
        onOpenChange={(open) => setDialog(open ? "methodology" : null)}
      />
    </div>
  );
}

// ───────────── 对话面板 ─────────────

function Conversation({
  dto,
  active,
  className = "max-h-[80vh]",
}: {
  dto: DebriefDto;
  active: ActiveEvidence | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const counterpart = dto.session.scenario.counterpart.name;

  useEffect(() => {
    if (!active) return;
    container.current
      ?.querySelector(`[data-user-turn="${active.turn}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);

  return (
    <div ref={container} className={`${className} space-y-3 overflow-y-auto bg-card rounded-xl border p-3`}>
      {dto.session.messages.map((m) => {
        const isUser = m.role === "user";
        const highlighted = isUser && active?.turn === m.turn;
        const at = highlighted && active.quote ? m.content.indexOf(active.quote) : -1;
        return (
          <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[90%] space-y-1">
              <div className={`text-muted-foreground text-xs ${isUser ? "text-right" : ""}`}>
                第 {m.turn} 轮 · {isUser ? "你" : counterpart}
              </div>
              <div
                data-user-turn={isUser ? m.turn : undefined}
                className={`rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  isUser ? "bg-brand-soft text-foreground" : "bg-muted"
                } ${highlighted ? "ring-2 ring-brand" : ""}`}
              >
                {at >= 0 && active ? (
                  <>
                    {m.content.slice(0, at)}
                    <mark className="bg-brand text-foreground rounded px-0.5">{active.quote}</mark>
                    {m.content.slice(at + active.quote.length)}
                  </>
                ) : (
                  m.content
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────── 判定卡片 ─────────────

function VerdictCard({
  verdict,
  onEvidence,
  onOverride,
  onUndo,
  conceptById,
}: {
  verdict: VerdictDto;
  onEvidence: (turn: number, quote: string, matched: boolean) => void;
  onOverride: (verdict: VerdictDto) => void;
  onUndo: (verdict: VerdictDto) => void;
  conceptById: Map<string, { id: string; name: string; explanation: string }>;
}) {
  const effective = verdict.effectiveVerdict;
  const overridden = verdict.override !== null;
  const concepts = (verdict.rewrite?.conceptIds ?? []).flatMap((id) => conceptById.get(id) ?? []);

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs ${VERDICT_STYLES[effective]}`}>
            {VERDICT_LABELS[effective]}
          </span>
          {verdict.effectiveQuality !== null ? (
            <span className="text-brand-ink" title={`质量分 ${verdict.effectiveQuality}`}>
              {stars(verdict.effectiveQuality)}
            </span>
          ) : null}
          {overridden ? <Badge variant="outline">已改判</Badge> : null}
          <span className="font-medium">{verdict.text}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onOverride(verdict)}>
          改判
        </Button>
      </div>

      {overridden && verdict.override ? (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded p-2 text-xs">
          <span>
            AI 判定：{VERDICT_LABELS[verdict.verdict]}
            {verdict.quality !== null ? `（${verdict.quality} 分）` : ""}；你的改判理由：{verdict.override.reason}
          </span>
          <Button size="sm" variant="outline" onClick={() => onUndo(verdict)}>
            撤销改判
          </Button>
        </div>
      ) : null}

      {verdict.evidenceDowngraded ? (
        <p className="rounded bg-warning/10 p-2 text-xs">
          {verdict.kind === "principle"
            ? "AI 认为违反了这条原则，但没能在你的原话中找到对应内容，已按遵守处理。"
            : "AI 认为做到了，但没能在你的原话中找到对应内容，已按未做到处理。"}
        </p>
      ) : null}

      <p>{verdict.comment}</p>

      {verdict.evidence.length > 0 ? (
        <ul className="space-y-1">
          {verdict.evidence.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-left text-xs underline decoration-dotted"
                onClick={() => onEvidence(e.turn, e.quote, e.match !== "none")}
              >
                第 {e.turn} 轮：「{e.quote}」
                {e.match === "none" ? "（未在你的原话中找到）" : e.match === "fuzzy" ? "（近似匹配）" : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {verdict.suggestion ? <p className="text-muted-foreground">建议：{verdict.suggestion}</p> : null}

      {verdict.rewrite ? (
        <div className="bg-success/8 space-y-1 rounded-lg p-3">
          <div>
            <span className="text-muted-foreground text-xs">你当时说（第 {verdict.rewrite.turn} 轮）</span>
            <p>{verdict.rewrite.original || "（这一要点没有对应的原话）"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">可以这样说</span>
            <p>{verdict.rewrite.rewrite}</p>
          </div>
          {concepts.map((c) => (
            <p key={c.id} className="text-muted-foreground text-xs">
              概念「{c.name}」：{c.explanation}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ───────────── 改判弹窗 ─────────────

function OverrideDialog({
  target,
  conditional,
  onClose,
  onSaved,
}: {
  target: VerdictDto | null;
  conditional: boolean;
  onClose: () => void;
  onSaved: (result: OverrideResultDto) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent>
        {target ? (
          <OverrideForm key={target.id} target={target} conditional={conditional} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({
  target,
  conditional,
  onClose,
  onSaved,
}: {
  target: VerdictDto;
  conditional: boolean;
  onClose: () => void;
  onSaved: (result: OverrideResultDto) => void;
}) {
  const [verdict, setVerdict] = useState<AnyVerdict>(target.effectiveVerdict);
  const [quality, setQuality] = useState<number | null>(target.effectiveQuality);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const options: AnyVerdict[] =
    target.kind === "principle"
      ? ["kept", "violated"]
      : conditional
        ? ["done", "partial", "missed", "not_triggered"]
        : ["done", "partial", "missed"];
  const range = verdict === "done" || verdict === "partial" ? QUALITY_RANGE[verdict] : null;
  const qualities = range ? Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i) : [];

  function choose(next: AnyVerdict) {
    setVerdict(next);
    if (next === "done" || next === "partial") {
      const r = QUALITY_RANGE[next];
      setQuality((q) => (q !== null && q >= r.min && q <= r.max ? q : r.max));
    } else {
      setQuality(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await requestJson<OverrideResultDto>(`/api/verdicts/${target.id}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, quality: range ? quality : null, reason }),
      });
      onSaved(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "改判失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>改判</DialogTitle>
        <DialogDescription>{target.text}。统计以改判后的结果为准。</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={verdict === option ? "default" : "outline"}
              onClick={() => choose(option)}
            >
              {VERDICT_LABELS[option]}
            </Button>
          ))}
        </div>
        {range ? (
          <div className="flex items-center gap-2">
            <span>质量分</span>
            {qualities.map((q) => (
              <Button
                key={q}
                type="button"
                size="sm"
                variant={quality === q ? "default" : "outline"}
                onClick={() => setQuality(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        ) : null}
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="改判理由（必填）"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button onClick={() => void save()} disabled={saving || !reason.trim()}>
          保存改判
        </Button>
      </DialogFooter>
    </>
  );
}
