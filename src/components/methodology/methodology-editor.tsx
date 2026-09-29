"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { SourceExcerpt } from "@/domain/schemas";
import type { MethodologyDetailDto } from "@/server/dto/methodology";

import {
  ConceptsSection,
  fid,
  ItemListSection,
  PrinciplesSection,
  StepsSection,
  type EditorFormValues,
} from "./editor-sections";
import { ExcerptDrawer } from "./excerpt";
import { CREATED_BY_LABELS, RequestError, requestJson, STATUS_LABELS } from "./labels";
import { MethodologyView } from "./methodology-view";

type Issue = { path: string; message: string };

function toForm(dto: MethodologyDetailDto): EditorFormValues {
  return { name: dto.name, tags: dto.tags, body: dto.body };
}

/** 提交前去掉多行文本产生的空行。 */
function toPayload(values: EditorFormValues): EditorFormValues {
  const clean = (lines: string[]) => lines.filter((line) => line.trim() !== "");
  return {
    ...values,
    body: {
      ...values.body,
      steps: values.body.steps.map((step) => ({
        ...step,
        exampleLines: clean(step.exampleLines),
        commonMistakes: clean(step.commonMistakes),
      })),
    },
  };
}

/** 校验问题的路径可能比页面上带 id 的元素更深，逐级回退到能找到的元素。 */
function locate(path: string): void {
  let current = path;
  while (current) {
    const element = document.getElementById(fid(current));
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus();
      return;
    }
    const next = current.replace(/(\.[^.[\]]+|\[\d+\])$/, "");
    if (next === current) return;
    current = next;
  }
}

export function MethodologyEditor({
  initial,
  allTags,
}: {
  initial: MethodologyDetailDto;
  allTags: string[];
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<SourceExcerpt | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelected, setSplitSelected] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");

  const form = useForm<EditorFormValues>({ defaultValues: toForm(initial) });
  const { control, register, reset, getValues, setValue } = form;
  const dirty = form.formState.isDirty;
  const readOnly = data.status === "archived";
  const tags = useWatch({ control, name: "tags" });

  // 有未保存修改时，刷新/关闭页面或点击站内链接都先提示。
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href?.startsWith("/") || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm("有未保存的修改，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function adopt(next: MethodologyDetailDto) {
    setData(next);
    reset(toForm(next));
    setIssues([]);
    setMode("view");
    setSplitMode(false);
    setSplitSelected([]);
    router.refresh();
  }

  function cancelEdit() {
    if (dirty && !window.confirm("放弃未保存的修改吗？")) return;
    reset(toForm(data));
    setIssues([]);
    setSplitMode(false);
    setSplitSelected([]);
    setTagInput("");
    setMode("view");
  }

  /** 统一处理请求：忙碌状态、错误提示、校验问题列表。 */
  async function run<T>(label: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    try {
      return await action();
    } catch (err) {
      if (err instanceof RequestError && err.issues?.length) {
        setIssues(err.issues);
        // 校验问题要定位到具体输入框，只有编辑模式才有。
        setMode("edit");
        toast.error(`有 ${err.issues.length} 个问题需要先修正`);
      } else {
        toast.error(err instanceof Error ? err.message : "操作失败");
      }
      return null;
    } finally {
      setBusy(null);
    }
  }

  const put = () =>
    requestJson<MethodologyDetailDto>(`/api/methodologies/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(getValues())),
    });

  const post = (path: string, body?: unknown) =>
    requestJson<MethodologyDetailDto>(`/api/methodologies/${data.id}/${path}`, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });

  async function save() {
    const saved = await run("save", put);
    if (saved) {
      adopt(saved);
      toast.success("已保存");
    }
  }

  async function transition(action: "confirm" | "unconfirm" | "archive" | "restore") {
    const done = await run(action, async () => {
      // 确认入库以已保存的内容为准，有未保存修改时先保存。
      if (action === "confirm" && dirty) await put();
      return post(action);
    });
    if (!done) return;
    adopt(done);
    toast.success(
      { confirm: "已确认入库", unconfirm: "已退回候选", archive: "已归档", restore: "已恢复为候选" }[action],
    );
  }

  async function split() {
    if (dirty) {
      toast.error("请先保存修改，再拆分");
      return;
    }
    const created = await run("split", () => post("split", { stepIds: splitSelected }));
    if (!created) return;
    toast.success("已拆分为新的候选方法论");
    router.push(`/library/${created.id}`);
  }

  function addTag(raw: string) {
    const name = raw.replace(/\s+/g, "");
    if (!name || tags.includes(name)) return;
    setValue("tags", [...tags, name], { shouldDirty: true });
    setTagInput("");
  }

  const removeTag = (name: string) =>
    setValue(
      "tags",
      tags.filter((t) => t !== name),
      { shouldDirty: true },
    );

  const suggestions = allTags.filter((t) => !tags.includes(t));

  const lifecycleButtons = (
    <>
      {data.status === "draft" ? (
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void transition("confirm")}>
          {busy === "confirm" ? "确认中……" : "确认入库"}
        </Button>
      ) : null}
      {data.status === "confirmed" ? (
        <Button type="button" variant="outline" disabled={busy !== null || dirty} onClick={() => void transition("unconfirm")}>
          退回候选
        </Button>
      ) : null}
      {data.status !== "archived" ? (
        <Button type="button" variant="outline" disabled={busy !== null || dirty} onClick={() => void transition("archive")}>
          归档
        </Button>
      ) : (
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void transition("restore")}>
          {data.mergedIntoId ? "恢复（撤销合并）" : "恢复"}
        </Button>
      )}
    </>
  );

  const excerptDrawer = (
    <ExcerptDrawer excerpt={excerpt} originChunks={data.originChunks} onClose={() => setExcerpt(null)} />
  );

  if (mode === "view") {
    return (
      <>
        <MethodologyView
          data={data}
          onOpenExcerpt={setExcerpt}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!readOnly ? (
                <Button type="button" disabled={busy !== null} onClick={() => setMode("edit")}>
                  编辑
                </Button>
              ) : null}
              {lifecycleButtons}
            </div>
          }
        />
        {excerptDrawer}
      </>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.status === "confirmed" ? "default" : "outline"}>{STATUS_LABELS[data.status]}</Badge>
          {data.status === "confirmed" ? <Badge variant="secondary">版本 {data.version}</Badge> : null}
          <Badge variant="outline">{CREATED_BY_LABELS[data.createdBy]}</Badge>
          {data.sourceId ? (
            <Link href={`/sources/${data.sourceId}`} className="text-muted-foreground text-sm hover:underline">
              来源：{data.sourceTitle ?? "资料"}
            </Link>
          ) : null}
          {readOnly && data.mergedIntoId ? (
            <Link href={`/library/${data.mergedIntoId}`} className="text-sm text-amber-600 hover:underline">
              已合并到另一个方法论，点击查看
            </Link>
          ) : null}
        </div>

        <fieldset disabled={readOnly || busy !== null} className="min-w-0 space-y-3">
          <Input
            id={fid("name")}
            className="h-11 text-lg font-medium"
            placeholder="方法论名称"
            aria-label="方法论名称"
            {...register("name")}
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm">标签</Label>
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => removeTag(tag)}>
                    ×
                  </button>
                </Badge>
              ))}
              <Input
                className="w-40"
                placeholder="添加标签，回车确认"
                aria-label="添加标签"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag(tagInput);
                  }
                }}
              />
            </div>
            {suggestions.length > 0 ? (
              <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                已有标签：
                {suggestions.map((tag) => (
                  <button key={tag} type="button" onClick={() => addTag(tag)}>
                    <Badge variant="outline">+ {tag}</Badge>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <Button type="submit" disabled={busy !== null || !dirty}>
              {busy === "save" ? "保存中……" : dirty ? "保存" : "已保存"}
            </Button>
          ) : null}
          {lifecycleButtons}
          {data.status === "draft" ? (
            <Button
              type="button"
              variant={splitMode ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => {
                setSplitMode(!splitMode);
                setSplitSelected([]);
              }}
            >
              {splitMode ? "退出拆分" : "拆分"}
            </Button>
          ) : null}
          {splitMode ? (
            <Button type="button" disabled={busy !== null || splitSelected.length === 0} onClick={() => void split()}>
              拆分为新方法论（{splitSelected.length}）
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={cancelEdit}>
            取消编辑
          </Button>
          {dirty ? <span className="text-sm text-amber-600">有未保存的修改</span> : null}
        </div>
      </div>

      {issues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>还有 {issues.length} 个问题需要先修正</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.map((issue, i) => (
                <li key={`${issue.path}-${i}`}>
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => locate(issue.path)}>
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={readOnly || busy !== null} className="min-w-0 space-y-6">
        <section className="space-y-2">
          <h2 className="text-lg font-medium">概要</h2>
          <div className="space-y-1">
            <Label htmlFor="summary">概要</Label>
            <Textarea id="summary" rows={2} placeholder="这个方法论解决什么问题" {...register("body.summary")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal">目标</Label>
            <Textarea id="goal" rows={2} placeholder="用户用它要达到什么结果" {...register("body.goal")} />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">顺序模式</h2>
          <Controller
            control={control}
            name="body.orderMode"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="strict" id="order-strict" />
                  <Label htmlFor="order-strict">严格顺序（错序会扣分）</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="loose" id="order-loose" />
                  <Label htmlFor="order-loose">顺序不敏感</Label>
                </div>
              </RadioGroup>
            )}
          />
        </section>

        <StepsSection
          control={control}
          register={register}
          onOpenExcerpt={setExcerpt}
          splitMode={splitMode}
          splitSelected={splitSelected}
          onToggleSplit={(stepId, checked) =>
            setSplitSelected((current) => (checked ? [...current, stepId] : current.filter((id) => id !== stepId)))
          }
        />
        <ItemListSection
          control={control}
          register={register}
          name="body.applicability"
          title="适用条件"
          hint="方法论适合使用的情境特征，是场景生成与识别评判的依据。确认入库至少需要 1 条。"
          onOpenExcerpt={setExcerpt}
        />
        <ItemListSection
          control={control}
          register={register}
          name="body.counterIndications"
          title="反例"
          hint="方法论不适合使用的情境特征，用于综合测验中构造干扰。"
          onOpenExcerpt={setExcerpt}
        />
        <PrinciplesSection control={control} register={register} onOpenExcerpt={setExcerpt} />
        <ConceptsSection control={control} register={register} onOpenExcerpt={setExcerpt} />
      </fieldset>

      {excerptDrawer}
    </form>
  );
}
