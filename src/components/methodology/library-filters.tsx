"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TagDto } from "@/server/services/tags";

const ALL = "__all__";

interface Props {
  status: string;
  tagId?: string;
  sourceId?: string;
  q?: string;
  tags: TagDto[];
  sources: { id: string; title: string }[];
}

export function LibraryFilters({ status, tagId, sourceId, q, tags, sources }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(q ?? "");

  function apply(next: { tagId?: string; sourceId?: string; q?: string }) {
    const merged = { tagId, sourceId, q, ...next };
    const search = new URLSearchParams({ status });
    if (merged.tagId) search.set("tagId", merged.tagId);
    if (merged.sourceId) search.set("sourceId", merged.sourceId);
    if (merged.q?.trim()) search.set("q", merged.q.trim());
    router.push(`/library?${search.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query });
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索名称"
        className="w-48"
        aria-label="搜索方法论名称"
      />
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
              {tag.name}（{tag.count}）
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
      <Button type="submit" variant="outline">
        搜索
      </Button>
    </form>
  );
}
