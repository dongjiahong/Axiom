"use client";

import { useRouter } from "next/navigation";

import { TagSourceSelect } from "@/components/common/tag-source-select";
import { Button } from "@/components/ui/button";

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
    const search = new URLSearchParams();
    if (next.tagId) search.set("tagId", next.tagId);
    if (next.sourceId) search.set("sourceId", next.sourceId);
    const query = search.toString();
    router.replace(query ? `/stats?${query}` : "/stats");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TagSourceSelect tagId={tagId} sourceId={sourceId} tags={tags} sources={sources} onChange={apply} />
      {tagId || sourceId ? (
        <Button type="button" variant="ghost" onClick={() => apply({})}>
          清除筛选
        </Button>
      ) : null}
    </div>
  );
}
