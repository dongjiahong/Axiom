"use client";

import { useRouter } from "next/navigation";

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
  tags: { id: string; name: string }[];
  sources: { id: string; title: string }[];
}

/** 统计页顶部筛选：标签、资料（筛选的是方法论）。 */
export function StatsFilters({ tagId, sourceId, tags, sources }: Props) {
  const router = useRouter();

  function apply(next: { tagId?: string; sourceId?: string }) {
    const merged = { tagId, sourceId, ...next };
    const search = new URLSearchParams();
    if (merged.tagId) search.set("tagId", merged.tagId);
    if (merged.sourceId) search.set("sourceId", merged.sourceId);
    const query = search.toString();
    router.push(query ? `/stats?${query}` : "/stats");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={tagId ?? ALL}
        onValueChange={(value) => apply({ tagId: value === ALL ? undefined : value })}
      >
        <SelectTrigger className="w-40" aria-label="按标签筛选">
          <SelectValue placeholder="全部标签" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>全部标签</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              {tag.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sourceId ?? ALL}
        onValueChange={(value) => apply({ sourceId: value === ALL ? undefined : value })}
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
    </div>
  );
}
