"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TagSourceSelect } from "@/components/common/tag-source-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIBRARY_SEARCH_DEBOUNCE_MS } from "@/domain/constants";
import type { TagDto } from "@/server/services/tags";

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
    // 筛选是同一页面的状态变化，不往浏览器历史里堆记录
    router.replace(`/library?${search.toString()}`);
  }

  // 输入停顿后自动搜索；回车也会立即搜索。
  useEffect(() => {
    if (query.trim() === (q ?? "")) return;
    const timer = setTimeout(() => apply({ q: query }), LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const active = Boolean(tagId || sourceId || q);

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
      <TagSourceSelect
        tagId={tagId}
        sourceId={sourceId}
        tags={tags}
        sources={sources}
        onChange={(next) => apply(next)}
      />
      {active ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setQuery("");
            router.replace(`/library?status=${status}`);
          }}
        >
          清除筛选
        </Button>
      ) : null}
    </form>
  );
}
