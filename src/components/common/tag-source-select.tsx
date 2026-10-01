"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

interface Props {
  tagId?: string;
  sourceId?: string;
  tags: { id: string; name: string; count?: number }[];
  sources: { id: string; title: string }[];
  onChange: (next: { tagId?: string; sourceId?: string }) => void;
}

/** 方法论库与统计页共用的「标签 / 资料」筛选下拉，选择后立即生效。 */
export function TagSourceSelect({ tagId, sourceId, tags, sources, onChange }: Props) {
  return (
    <>
      <Select
        value={tagId ?? ALL}
        onValueChange={(value) => onChange({ tagId: value === ALL ? undefined : value, sourceId })}
      >
        <SelectTrigger className="w-40" aria-label="按标签筛选">
          <SelectValue placeholder="全部标签" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>全部标签</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              {tag.name}
              {tag.count === undefined ? "" : `（${tag.count}）`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sourceId ?? ALL}
        onValueChange={(value) => onChange({ tagId, sourceId: value === ALL ? undefined : value })}
      >
        <SelectTrigger className="w-48" aria-label="按资料筛选">
          <SelectValue placeholder="全部资料" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>全部资料</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
