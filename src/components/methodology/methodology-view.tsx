"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { SourceExcerpt, Step } from "@/domain/schemas";
import type { MethodologyDetailDto } from "@/server/dto/methodology";

import { ExcerptBadge } from "./excerpt";
import { CREATED_BY_LABELS, STATUS_LABELS } from "./labels";

type OpenExcerpt = (excerpt: SourceExcerpt) => void;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

const Empty = () => <p className="text-muted-foreground text-sm">暂无</p>;

function StepNumber({ index, conditional }: { index: number; conditional: boolean }) {
  return (
    <span
      className={
        conditional
          ? "bg-background flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-amber-500 text-xs font-bold text-amber-600"
          : "bg-foreground text-background flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      }
    >
      {index + 1}
    </span>
  );
}

const ConditionalTag = () => (
  <Badge variant="outline" className="border-amber-500 text-amber-600">
    条件步骤
  </Badge>
);

/** 示例话术的引用条。 */
const Quote = ({ children }: { children: ReactNode }) => (
  <p className="rounded-r-md border-l-2 border-sky-500 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
    {children}
  </p>
);

function Stat({ value, label, text = false }: { value: ReactNode; label: string; text?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={text ? "pt-1 text-base font-semibold" : "text-2xl leading-tight font-bold tabular-nums"}>
        {value}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function ItemCard({
  tone,
  title,
  items,
  onOpenExcerpt,
}: {
  tone: "ok" | "bad";
  title: string;
  items: MethodologyDetailDto["body"]["applicability"];
  onOpenExcerpt: OpenExcerpt;
}) {
  const ok = tone === "ok";
  return (
    <div className={ok ? "space-y-2 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30" : "space-y-2 rounded-xl bg-red-50 p-4 dark:bg-red-950/30"}>
      <h3 className={ok ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400" : "text-sm font-semibold text-red-700 dark:text-red-400"}>
        {ok ? "✓" : "✗"} {title}
      </h3>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{item.text}</span>
              <ExcerptBadge node={item} onOpen={onOpenExcerpt} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepDetail({
  step,
  index,
  onOpenExcerpt,
}: {
  step: Step;
  index: number;
  onOpenExcerpt: OpenExcerpt;
}) {
  return (
    <details className="group rounded-lg border" open={index === 0}>
      <summary className="hover:bg-muted/50 group-open:bg-muted/40 flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-4 py-3 [&::-webkit-details-marker]:hidden">
        <StepNumber index={index} conditional={step.conditional} />
        <span className="font-semibold">{step.title}</span>
        {step.conditional ? <ConditionalTag /> : null}
        <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
          {step.keyPoints.length} 个要点
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <div className="grid gap-5 px-4 py-4 sm:grid-cols-2">
        {step.conditional || step.excerpt || step.inferred ? (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            {step.conditional ? (
              <span className="text-sm text-amber-600">触发条件：{step.trigger}</span>
            ) : null}
            <ExcerptBadge node={step} onOpen={onOpenExcerpt} />
          </div>
        ) : null}
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide">要点</h3>
          <ul className="space-y-1.5 text-sm">
            {step.keyPoints.map((point) => (
              <li key={point.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{point.text}</span>
                <ExcerptBadge node={point} onOpen={onOpenExcerpt} />
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide">常见错误</h3>
          {step.commonMistakes.length === 0 ? (
            <Empty />
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-red-700 dark:text-red-400">
              {step.commonMistakes.map((mistake, i) => (
                <li key={i}>{mistake}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}

/** 方法论阅读视图：先看全貌（是什么、几步、每步做什么、示例），再看细节。 */
export function MethodologyView({
  data,
  actions,
  onOpenExcerpt,
}: {
  data: MethodologyDetailDto;
  actions: ReactNode;
  onOpenExcerpt: OpenExcerpt;
}) {
  const { body } = data;
  const strict = body.orderMode === "strict";
  const conditionalCount = body.steps.filter((step) => step.conditional).length;
  const stepTitle = new Map(body.steps.map((step, i) => [step.id, `步骤 ${i + 1}`]));
  const examples = body.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.exampleLines.some((line) => line.trim() !== ""));

  return (
    <div className="space-y-9">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.status === "confirmed" ? "default" : "outline"}>{STATUS_LABELS[data.status]}</Badge>
          {data.status === "confirmed" ? <Badge variant="secondary">版本 {data.version}</Badge> : null}
          <Badge variant="outline">{CREATED_BY_LABELS[data.createdBy]}</Badge>
          {data.sourceId ? (
            <Link href={`/sources/${data.sourceId}`} className="text-muted-foreground text-sm hover:underline">
              来源：{data.sourceTitle ?? "资料"}
            </Link>
          ) : null}
          {data.status === "archived" && data.mergedIntoId ? (
            <Link href={`/library/${data.mergedIntoId}`} className="text-sm text-amber-600 hover:underline">
              已合并到另一个方法论，点击查看
            </Link>
          ) : null}
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl leading-tight font-bold tracking-tight">{data.name || "未命名方法论"}</h1>
          {body.summary ? <p className="text-base">{body.summary}</p> : null}
          {body.goal ? (
            <p className="text-muted-foreground text-sm">
              <span className="mr-1.5 font-medium">目标</span>
              {body.goal}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-7 gap-y-3">
          <Stat
            value={body.steps.length}
            label={conditionalCount > 0 ? `个步骤（含 ${conditionalCount} 个条件步骤）` : "个步骤"}
          />
          <Stat text value={strict ? "严格顺序" : "顺序不敏感"} label={strict ? "错序会扣分" : "顺序可调整"} />
          <Stat value={body.principles.length} label="条原则" />
        </div>

        {actions}
      </header>

      <Section title="流程一览" hint={strict ? "按顺序执行" : "顺序不敏感"}>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-4 gap-y-6">
          {body.steps.map((step, index) => (
            <li key={step.id} className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <StepNumber index={index} conditional={step.conditional} />
                <div className="bg-border h-px flex-1" />
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              {step.conditional ? <ConditionalTag /> : null}
              {step.description ? (
                <p className="text-muted-foreground line-clamp-3 text-sm">{step.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      {examples.length > 0 ? (
        <Section title="示例" hint="把每一步的示例话术串起来，就是一次完整的沟通">
          <div className="bg-muted/40 space-y-3 rounded-xl border p-4">
            {examples.map(({ step, index }) => (
              <div key={step.id} className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                <span className="text-muted-foreground flex shrink-0 items-start gap-1.5 pt-2 text-xs sm:w-36">
                  <span>{index + 1}.</span>
                  <span className="line-clamp-2">{step.title}</span>
                  {step.conditional ? <span className="whitespace-nowrap text-amber-600">（条件）</span> : null}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {step.exampleLines
                    .filter((line) => line.trim() !== "")
                    .map((line, i) => (
                      <Quote key={i}>{line}</Quote>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="标签">
        {data.tags.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title="适用与不适用" hint="决定什么时候该用它">
        <div className="grid gap-3 md:grid-cols-2">
          <ItemCard tone="ok" title="适用条件" items={body.applicability} onOpenExcerpt={onOpenExcerpt} />
          <ItemCard tone="bad" title="反例" items={body.counterIndications} onOpenExcerpt={onOpenExcerpt} />
        </div>
      </Section>

      <Section title="步骤详解" hint="要点与常见错误，点击展开">
        <div className="space-y-2">
          {body.steps.map((step, index) => (
            <StepDetail key={step.id} step={step} index={index} onOpenExcerpt={onOpenExcerpt} />
          ))}
        </div>
      </Section>

      <Section title="原则" hint="贯穿全程、无顺序的要求或禁忌">
        {body.principles.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y">
            {body.principles.map((principle) => (
              <li key={principle.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge
                  variant="outline"
                  className={
                    principle.kind === "do"
                      ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "border-transparent bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  }
                >
                  {principle.kind === "do" ? "要做" : "禁忌"}
                </Badge>
                <span>{principle.text}</span>
                <ExcerptBadge node={principle} onOpen={onOpenExcerpt} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="概念" hint="支撑方法论的原理，用于复盘讲解">
        {body.concepts.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {body.concepts.map((concept) => {
              const related = concept.relatedStepIds.flatMap((id) => stepTitle.get(id) ?? []);
              return (
                <div key={concept.id} className="space-y-1 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{concept.name}</h3>
                    <ExcerptBadge node={concept} onOpen={onOpenExcerpt} />
                  </div>
                  {concept.explanation ? (
                    <p className="text-muted-foreground text-sm">{concept.explanation}</p>
                  ) : null}
                  {related.length > 0 ? (
                    <p className="text-muted-foreground text-xs">关联步骤：{related.join("、")}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
