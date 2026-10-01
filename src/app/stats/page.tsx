import { PageHeader } from "@/components/common/page-header";
import { StatsFilters } from "@/components/stats/stats-filters";
import { StatsView } from "@/components/stats/stats-view";
import { listSources } from "@/server/services/sources";
import { getStatsDifficulty, getStatsOverview } from "@/server/services/stats";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() !== "" ? v : undefined;
}

export default async function StatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filter = { tagId: first(params.tagId), sourceId: first(params.sourceId) };
  const overview = getStatsOverview(filter);
  const difficulty = getStatsDifficulty(filter);
  const tags = listTags();
  const sources = listSources();

  return (
    <div className="space-y-4">
      <PageHeader title="统计" description="只统计已复盘的练习，分数用改判后重算的执行分。" />

      <StatsFilters
        tagId={filter.tagId}
        sourceId={filter.sourceId}
        tags={tags}
        sources={sources.map((source) => ({ id: source.id, title: source.title }))}
      />

      <StatsView
        overview={overview}
        difficulty={difficulty}
        filtered={Boolean(filter.tagId || filter.sourceId)}
      />
    </div>
  );
}
