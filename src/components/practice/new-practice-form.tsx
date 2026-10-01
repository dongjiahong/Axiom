"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Difficulty, SelectionMode } from "@/domain/schemas";
import { resolveScope } from "@/domain/selection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EmptyState } from "@/components/common/empty-state";

import { DifficultyPicker } from "./difficulty-picker";
import { useStartPractice } from "./use-start-practice";

export interface ScopeMethodology {
  id: string;
  name: string;
  sourceId: string | null;
  tagIds: string[];
}

interface Props {
  methodologies: ScopeMethodology[];
  tags: { id: string; name: string }[];
  sources: { id: string; title: string }[];
}

function toggled(list: string[], id: string, checked: boolean): string[] {
  return checked ? [...list, id] : list.filter((x) => x !== id);
}

export function NewPracticeForm({ methodologies, tags, sources }: Props) {
  const [selection, setSelection] = useState<SelectionMode>("pick");
  const [pickId, setPickId] = useState<string | null>(null);
  // 标签全部命中、资料任选其一；都不选表示整个方法论库。两者取交集。
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("neutral");
  const [query, setQuery] = useState("");
  const { start, busy: submitting, overlay } = useStartPractice();

  const scope = useMemo(() => ({ tagIds, sourceIds }), [tagIds, sourceIds]);
  const scoped = useMemo(() => resolveScope(scope, methodologies), [scope, methodologies]);
  const picking = selection === "pick";
  const visible = scoped.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()));
  const filterableTags = tags.filter((tag) => methodologies.some((m) => m.tagIds.includes(tag.id)));

  const problem = picking
    ? pickId
      ? null
      : "请先选择 1 个方法论"
    : scoped.length === 0
      ? "选题范围内没有已确认的方法论，请放宽标签或资料筛选"
      : null;

  function submit() {
    void start(
      picking && pickId
        ? { selection, methodologyId: pickId, scope, difficulty }
        : { selection, scope, difficulty },
    );
  }

  if (methodologies.length === 0) {
    return (
      <EmptyState>
        方法论库里还没有已确认的方法论。先
        <Link href="/sources" className="text-foreground mx-1 underline">
          导入资料并抽取
        </Link>
        ，再到
        <Link href="/library" className="text-foreground mx-1 underline">
          方法论库
        </Link>
        确认入库。
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. 选题</CardTitle>
          <CardDescription>
            指定一个方法论，或在筛选出的方法论中随机抽取。标签需全部命中，资料只需属于其中之一。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={selection}
            onValueChange={(value) => setSelection(value as SelectionMode)}
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

          <div className="space-y-3">
            {filterableTags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按标签筛选">
                <span className="text-muted-foreground mr-1 text-sm">标签</span>
                {filterableTags.map((tag) => (
                  <Button
                    key={tag.id}
                    type="button"
                    size="sm"
                    variant={tagIds.includes(tag.id) ? "secondary" : "outline"}
                    aria-pressed={tagIds.includes(tag.id)}
                    onClick={() => setTagIds((c) => toggled(c, tag.id, !c.includes(tag.id)))}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>
            ) : null}
            {sources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按资料筛选">
                <span className="text-muted-foreground mr-1 text-sm">资料</span>
                {sources.map((source) => (
                  <Button
                    key={source.id}
                    type="button"
                    size="sm"
                    variant={sourceIds.includes(source.id) ? "secondary" : "outline"}
                    aria-pressed={sourceIds.includes(source.id)}
                    onClick={() => setSourceIds((c) => toggled(c, source.id, !c.includes(source.id)))}
                  >
                    {source.title}
                  </Button>
                ))}
              </div>
            ) : null}
            {tagIds.length > 0 || sourceIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTagIds([]);
                  setSourceIds([]);
                }}
              >
                清除筛选
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="practice-methodology-query">方法论</Label>
            {picking ? (
              <Input
                id="practice-methodology-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索方法论名称"
                className="max-w-64"
              />
            ) : null}
            {picking ? (
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
            ) : (
              <details className="rounded-md border text-sm">
                <summary className="cursor-pointer px-3 py-2">查看范围内的方法论（{scoped.length}）</summary>
                <ul className="max-h-64 space-y-2 overflow-y-auto border-t p-3">
                  {scoped.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                  {scoped.length === 0 ? (
                    <li className="text-muted-foreground">没有匹配的方法论</li>
                  ) : null}
                </ul>
              </details>
            )}
            {picking && pickId && !visible.some((m) => m.id === pickId) ? (
              <p className="text-muted-foreground text-sm">
                已选「{methodologies.find((m) => m.id === pickId)?.name}」，不在当前筛选结果中
              </p>
            ) : null}
            <p className="text-sm">
              范围内共 <span className="font-medium">{scoped.length}</span> 个已确认方法论
              {picking ? "" : "，将从中随机抽取 1 个"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 难度</CardTitle>
        </CardHeader>
        <CardContent>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} columns />
        </CardContent>
      </Card>

      {/* 小屏固定在底部：表单很长，按钮不用滚到最后 */}
      <div className="bg-background sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
        <Button onClick={submit} disabled={submitting || problem !== null}>
          {submitting ? "正在设计场景……" : "生成场景"}
        </Button>
        {problem ? <p className="text-muted-foreground text-sm">{problem}</p> : null}
      </div>
      {overlay}
    </div>
  );
}
