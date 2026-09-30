"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QUIZ_MIN_SCOPE_SIZE } from "@/domain/constants";
import type { Difficulty, PracticeMode } from "@/domain/schemas";
import { resolveScope } from "@/domain/selection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { requestJson } from "@/components/methodology/labels";

import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
} from "./labels";

export interface ScopeMethodology {
  id: string;
  name: string;
  sourceId: string | null;
  tagIds: string[];
}

interface Props {
  initialMode: PracticeMode;
  methodologies: ScopeMethodology[];
  tags: { id: string; name: string }[];
  sources: { id: string; title: string }[];
}

type DrillSelection = "pick" | "random";

function toggled(list: string[], id: string, checked: boolean): string[] {
  return checked ? [...list, id] : list.filter((x) => x !== id);
}

export function NewPracticeForm({ initialMode, methodologies, tags, sources }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<PracticeMode>(initialMode);
  const [drillSelection, setDrillSelection] = useState<DrillSelection>("pick");
  const [pickId, setPickId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [methodologyIds, setMethodologyIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("neutral");
  const [query, setQuery] = useState("");
  // 只筛选下方列表的显示，不参与选题范围；多个标签同时选中时取交集（逐步收窄）。
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const scope = useMemo(() => ({ tagIds, sourceIds, methodologyIds }), [tagIds, sourceIds, methodologyIds]);
  const scopeSize = useMemo(() => resolveScope(scope, methodologies).length, [scope, methodologies]);
  const visible = methodologies
    .filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((m) => filterTagIds.every((tagId) => m.tagIds.includes(tagId)));
  const filterableTags = tags.filter((tag) => methodologies.some((m) => m.tagIds.includes(tag.id)));

  const picking = mode === "drill" && drillSelection === "pick";
  const minSize = mode === "quiz" ? QUIZ_MIN_SCOPE_SIZE : 1;
  const problem = picking
    ? pickId
      ? null
      : "请先选择 1 个方法论"
    : scopeSize < minSize
      ? `选题范围内至少需要 ${minSize} 个已确认方法论，当前只有 ${scopeSize} 个`
      : null;

  async function submit() {
    setSubmitting(true);
    try {
      const body = picking
        ? {
            mode,
            selection: "pick",
            methodologyId: pickId,
            scope: { tagIds: [], sourceIds: [], methodologyIds: [pickId] },
            difficulty,
          }
        : { mode, selection: "random", scope, difficulty };
      const { sessionId } = await requestJson<{ sessionId: string }>("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.push(`/practice/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成场景失败");
      setSubmitting(false);
    }
  }

  if (methodologies.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        方法论库里还没有已确认的方法论。先
        <Link href="/sources" className="text-foreground mx-1 underline">
          导入资料并抽取
        </Link>
        ，再到
        <Link href="/library" className="text-foreground mx-1 underline">
          方法论库
        </Link>
        确认入库。
      </div>
    );
  }

  const tagFilter = filterableTags.length > 0 ? (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按标签筛选">
      <span className="text-muted-foreground mr-1 text-sm">标签</span>
      {filterableTags.map((tag) => {
        const active = filterTagIds.includes(tag.id);
        return (
          <Button
            key={tag.id}
            type="button"
            size="sm"
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            onClick={() => setFilterTagIds((current) => toggled(current, tag.id, !active))}
          >
            {tag.name}
          </Button>
        );
      })}
      {filterTagIds.length > 0 ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setFilterTagIds([])}>
          清除
        </Button>
      ) : null}
    </div>
  ) : null;

  const scopeEditor = (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        按标签、资料或逐个勾选划定范围，三者取并集；都不勾选表示整个方法论库。
        {mode === "quiz" ? `综合测验的范围至少包含 ${QUIZ_MIN_SCOPE_SIZE} 个方法论，它同时是你开场前可选的候选列表。` : ""}
      </p>
      {tags.length > 0 ? (
        <div className="space-y-2">
          <Label>标签</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={tagIds.includes(tag.id)}
                  onCheckedChange={(checked) => setTagIds((c) => toggled(c, tag.id, checked === true))}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div className="space-y-2">
          <Label>资料</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {sources.map((source) => (
              <label key={source.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={sourceIds.includes(source.id)}
                  onCheckedChange={(checked) =>
                    setSourceIds((c) => toggled(c, source.id, checked === true))
                  }
                />
                {source.title}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>逐个勾选</Label>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索方法论名称"
          className="max-w-64"
          aria-label="搜索方法论名称"
        />
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
          {visible.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={methodologyIds.includes(m.id)}
                onCheckedChange={(checked) =>
                  setMethodologyIds((c) => toggled(c, m.id, checked === true))
                }
              />
              {m.name}
            </label>
          ))}
          {visible.length === 0 ? <p className="text-muted-foreground text-sm">没有匹配的方法论</p> : null}
        </div>
      </div>
      <p className="text-sm">
        范围内共 <span className="font-medium">{scopeSize}</span> 个已确认方法论
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. 模式</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as PracticeMode)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {(["drill", "quiz"] as const).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  mode === m ? "border-primary bg-muted/50" : ""
                }`}
              >
                <RadioGroupItem value={m} className="mt-1" />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{MODE_LABELS[m]}</span>
                  <span className="text-muted-foreground block text-xs">{MODE_DESCRIPTIONS[m]}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 选题</CardTitle>
          {mode === "drill" ? (
            <CardDescription>指定一个方法论，或在范围内按掌握度随机抽取（练得少的更容易被抽到）。</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "drill" || tagFilter ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {mode === "drill" ? (
                <RadioGroup
                  value={drillSelection}
                  onValueChange={(value) => setDrillSelection(value as DrillSelection)}
                  className="flex w-auto gap-6"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="pick" />
                    指定
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="random" />
                    随机
                  </label>
                </RadioGroup>
              ) : null}
              {tagFilter}
            </div>
          ) : null}

          {picking ? (
            <div className="space-y-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索方法论名称"
                className="max-w-64"
                aria-label="搜索方法论名称"
              />
              <RadioGroup
                value={pickId ?? ""}
                onValueChange={setPickId}
                className="max-h-64 gap-2 overflow-y-auto rounded-md border p-3"
              >
                {visible.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={m.id} />
                    {m.name}
                  </label>
                ))}
                {visible.length === 0 ? (
                  <p className="text-muted-foreground text-sm">没有匹配的方法论</p>
                ) : null}
              </RadioGroup>
              {pickId && !visible.some((m) => m.id === pickId) ? (
                <p className="text-muted-foreground text-sm">
                  已选「{methodologies.find((m) => m.id === pickId)?.name}」，不在当前筛选结果中
                </p>
              ) : null}
            </div>
          ) : (
            scopeEditor
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 难度</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={difficulty}
            onValueChange={(value) => setDifficulty(value as Difficulty)}
            className="grid gap-3 sm:grid-cols-3"
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
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={submitting || problem !== null}>
          {submitting ? "正在设计场景……" : "生成场景"}
        </Button>
        {problem ? <p className="text-muted-foreground text-sm">{problem}</p> : null}
      </div>
    </div>
  );
}
