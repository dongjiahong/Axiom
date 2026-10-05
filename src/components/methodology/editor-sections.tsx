"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { MethodologyBody, SourceExcerpt } from "@/domain/schemas";

import { ExcerptBadge } from "./excerpt";

export interface EditorFormValues {
  name: string;
  tags: string[];
  body: MethodologyBody;
}

export type EditorControl = Control<EditorFormValues>;
type Register = UseFormRegister<EditorFormValues>;
type OpenExcerpt = (excerpt: SourceExcerpt) => void;

/** 校验问题的 path 与页面元素 id 的对应（用于定位到字段）。 */
export const fid = (path: string) => `f-${path}`;

const KEY = "_key" as const;

/** 手动添加的节点：没有摘录，也不是 AI 推断。 */
const newNode = () => ({ id: nanoid(), excerpt: null, inferred: false });

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

// ───────────── 适用条件 / 反例 ─────────────

export function ItemListSection({
  control,
  register,
  name,
  title,
  hint,
  onOpenExcerpt,
}: {
  control: EditorControl;
  register: Register;
  name: "body.applicability" | "body.counterIndications";
  title: string;
  hint: string;
  onOpenExcerpt: OpenExcerpt;
}) {
  const { fields, append, remove } = useFieldArray({ control, name, keyName: KEY });
  const key = name === "body.applicability" ? "applicability" : "counterIndications";
  return (
    <section id={fid(key)} className="space-y-2">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {fields.map((field, index) => (
        <div key={field[KEY]} className="flex items-center gap-2">
          <Input
            id={fid(`${key}[${index}].text`)}
            aria-label={`${title} ${index + 1}`}
            {...register(`${name}.${index}.text`)}
          />
          <ExcerptBadge node={field} onOpen={onOpenExcerpt} />
          <IconButton label="删除" onClick={() => remove(index)}>
            <Trash2 />
          </IconButton>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ ...newNode(), text: "" })}>
        <Plus /> 添加
      </Button>
    </section>
  );
}

// ───────────── 步骤 ─────────────

export function StepsSection({
  control,
  register,
  onOpenExcerpt,
  splitMode,
  splitSelected,
  onToggleSplit,
}: {
  control: EditorControl;
  register: Register;
  onOpenExcerpt: OpenExcerpt;
  splitMode: boolean;
  splitSelected: string[];
  onToggleSplit: (stepId: string, checked: boolean) => void;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "body.steps", keyName: KEY });
  return (
    <section id={fid("steps")} className="space-y-3">
      <h2 className="text-lg font-medium">步骤</h2>
      {fields.map((field, index) => (
        <StepCard
          key={field[KEY]}
          control={control}
          register={register}
          index={index}
          stepNode={field}
          count={fields.length}
          onOpenExcerpt={onOpenExcerpt}
          onMove={(to) => move(index, to)}
          onRemove={() => remove(index)}
          splitMode={splitMode}
          splitChecked={splitSelected.includes(field.id)}
          onToggleSplit={(checked) => onToggleSplit(field.id, checked)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          append({
            ...newNode(),
            title: "",
            description: "",
            conditional: false,
            trigger: null,
            keyPoints: [{ ...newNode(), text: "" }],
            exampleLines: [],
            commonMistakes: [],
          })
        }
      >
        <Plus /> 添加步骤
      </Button>
    </section>
  );
}

/** 每行一条的多行文本 ↔ 字符串数组。 */
function LinesField({
  control,
  name,
  label,
  placeholder,
}: {
  control: EditorControl;
  name: `body.steps.${number}.exampleLines` | `body.steps.${number}.commonMistakes`;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}（每行一条）</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Textarea
            rows={2}
            placeholder={placeholder}
            value={(field.value ?? []).join("\n")}
            onChange={(event) => field.onChange(event.target.value.split("\n"))}
            onBlur={field.onBlur}
          />
        )}
      />
    </div>
  );
}

function StepCard({
  control,
  register,
  index,
  stepNode,
  count,
  onOpenExcerpt,
  onMove,
  onRemove,
  splitMode,
  splitChecked,
  onToggleSplit,
}: {
  control: EditorControl;
  register: Register;
  index: number;
  stepNode: ExcerptNodeLike;
  count: number;
  onOpenExcerpt: OpenExcerpt;
  onMove: (to: number) => void;
  onRemove: () => void;
  splitMode: boolean;
  splitChecked: boolean;
  onToggleSplit: (checked: boolean) => void;
}) {
  const path = `steps[${index}]`;
  const conditional = useWatch({ control, name: `body.steps.${index}.conditional` });
  const { fields, append, remove } = useFieldArray({
    control,
    name: `body.steps.${index}.keyPoints`,
    keyName: KEY,
  });

  return (
    <div id={fid(path)} className="space-y-3 bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {splitMode ? (
          <Checkbox
            checked={splitChecked}
            onCheckedChange={(value) => onToggleSplit(value === true)}
            aria-label={`选择步骤 ${index + 1} 拆出`}
          />
        ) : null}
        <span className="text-muted-foreground text-sm font-medium">步骤 {index + 1}</span>
        <ExcerptBadge node={stepNode} onOpen={onOpenExcerpt} />
        <div className="ml-auto flex items-center">
          <IconButton label="上移" onClick={() => onMove(index - 1)} disabled={index === 0}>
            <ArrowUp />
          </IconButton>
          <IconButton label="下移" onClick={() => onMove(index + 1)} disabled={index === count - 1}>
            <ArrowDown />
          </IconButton>
          <IconButton label="删除步骤" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <Input
        id={fid(`${path}.title`)}
        placeholder="步骤标题"
        aria-label={`步骤 ${index + 1} 标题`}
        {...register(`body.steps.${index}.title`)}
      />
      <Textarea rows={2} placeholder="说明" aria-label={`步骤 ${index + 1} 说明`} {...register(`body.steps.${index}.description`)} />

      <div className="flex flex-wrap items-center gap-3">
        <Controller
          control={control}
          name={`body.steps.${index}.conditional`}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch id={fid(`${path}.conditional`)} checked={field.value} onCheckedChange={field.onChange} />
              <Label htmlFor={fid(`${path}.conditional`)}>条件步骤（只在对方做出特定反应时才需要）</Label>
            </div>
          )}
        />
        {conditional ? (
          <Controller
            control={control}
            name={`body.steps.${index}.trigger`}
            render={({ field }) => (
              <Input
                id={fid(`${path}.trigger`)}
                className="min-w-64 flex-1"
                placeholder="触发条件，如：对方以预算为由拒绝"
                aria-label={`步骤 ${index + 1} 触发条件`}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
              />
            )}
          />
        ) : null}
      </div>

      <div id={fid(`${path}.keyPoints`)} className="space-y-2">
        <Label>要点</Label>
        {fields.map((keyPoint, keyIndex) => (
          <div key={keyPoint[KEY]} className="flex items-center gap-2">
            <Input
              id={fid(`${path}.keyPoints[${keyIndex}].text`)}
              aria-label={`步骤 ${index + 1} 要点 ${keyIndex + 1}`}
              {...register(`body.steps.${index}.keyPoints.${keyIndex}.text`)}
            />
            <ExcerptBadge node={keyPoint} onOpen={onOpenExcerpt} />
            <IconButton label="删除要点" onClick={() => remove(keyIndex)}>
              <Trash2 />
            </IconButton>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ...newNode(), text: "" })}>
          <Plus /> 添加要点
        </Button>
      </div>

      <LinesField control={control} name={`body.steps.${index}.exampleLines`} label="示例话术" placeholder="如：我想和您聊聊我这一年的成果" />
      <LinesField control={control} name={`body.steps.${index}.commonMistakes`} label="常见错误" placeholder="如：一开口就谈别人的薪水" />
    </div>
  );
}

type ExcerptNodeLike = { excerpt: SourceExcerpt | null; inferred: boolean };

// ───────────── 原则 ─────────────

export function PrinciplesSection({
  control,
  register,
  onOpenExcerpt,
}: {
  control: EditorControl;
  register: Register;
  onOpenExcerpt: OpenExcerpt;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "body.principles", keyName: KEY });
  return (
    <section id={fid("principles")} className="space-y-2">
      <div>
        <h2 className="text-lg font-medium">原则</h2>
        <p className="text-muted-foreground text-sm">贯穿全程、无顺序的要求或禁忌，如“不威胁离职”。</p>
      </div>
      {fields.map((field, index) => (
        <div key={field[KEY]} className="flex items-center gap-2">
          <Controller
            control={control}
            name={`body.principles.${index}.kind`}
            render={({ field: kind }) => (
              <Select value={kind.value} onValueChange={kind.onChange}>
                <SelectTrigger className="w-28" aria-label={`原则 ${index + 1} 类型`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="do">要做</SelectItem>
                  <SelectItem value="dont">禁忌</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <Input
            id={fid(`principles[${index}].text`)}
            aria-label={`原则 ${index + 1}`}
            {...register(`body.principles.${index}.text`)}
          />
          <ExcerptBadge node={field} onOpen={onOpenExcerpt} />
          <IconButton label="删除" onClick={() => remove(index)}>
            <Trash2 />
          </IconButton>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ ...newNode(), kind: "do", text: "" })}>
        <Plus /> 添加原则
      </Button>
    </section>
  );
}

// ───────────── 概念 ─────────────

export function ConceptsSection({
  control,
  register,
  onOpenExcerpt,
}: {
  control: EditorControl;
  register: Register;
  onOpenExcerpt: OpenExcerpt;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "body.concepts", keyName: KEY });
  const steps = useWatch({ control, name: "body.steps" });
  return (
    <section id={fid("concepts")} className="space-y-3">
      <div>
        <h2 className="text-lg font-medium">概念</h2>
        <p className="text-muted-foreground text-sm">支撑方法论的原理或术语，只用于复盘时讲解，不单独评判。</p>
      </div>
      {fields.map((field, index) => (
        <div key={field[KEY]} className="space-y-2 bg-card rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Input
              id={fid(`concepts[${index}].name`)}
              placeholder="概念名称，如：锚定效应"
              aria-label={`概念 ${index + 1} 名称`}
              {...register(`body.concepts.${index}.name`)}
            />
            <ExcerptBadge node={field} onOpen={onOpenExcerpt} />
            <IconButton label="删除概念" onClick={() => remove(index)}>
              <Trash2 />
            </IconButton>
          </div>
          <Textarea rows={2} placeholder="解释" aria-label={`概念 ${index + 1} 解释`} {...register(`body.concepts.${index}.explanation`)} />
          <Controller
            control={control}
            name={`body.concepts.${index}.relatedStepIds`}
            render={({ field: related }) => (
              <div className="space-y-1">
                <Label>关联步骤</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {steps.map((step, stepIndex) => (
                    <label key={step.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={related.value.includes(step.id)}
                        onCheckedChange={(checked) =>
                          related.onChange(
                            checked === true
                              ? [...related.value, step.id]
                              : related.value.filter((id) => id !== step.id),
                          )
                        }
                      />
                      {step.title || `步骤 ${stepIndex + 1}`}
                    </label>
                  ))}
                </div>
              </div>
            )}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ ...newNode(), name: "", explanation: "", relatedStepIds: [] })}
      >
        <Plus /> 添加概念
      </Button>
    </section>
  );
}
