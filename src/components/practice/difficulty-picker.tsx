"use client";

import type { Difficulty } from "@/domain/schemas";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS } from "./labels";

const ORDER = ["cooperative", "neutral", "tough"] as const;

/** 难度三选一：所有开始练习的入口共用。`columns` 为 true 时在宽屏横排三列。 */
export function DifficultyPicker({
  value,
  onChange,
  columns = false,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  columns?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as Difficulty)}
      className={cn("grid gap-3", columns && "sm:grid-cols-3")}
      aria-label="难度"
    >
      {ORDER.map((d) => (
        <label
          key={d}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
            value === d && "border-primary bg-muted/50",
          )}
        >
          <RadioGroupItem value={d} className="mt-1" />
          <span className="space-y-1">
            <span className="block text-sm font-medium">{DIFFICULTY_LABELS[d]}</span>
            <span className="text-muted-foreground block text-xs">{DIFFICULTY_DESCRIPTIONS[d]}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
