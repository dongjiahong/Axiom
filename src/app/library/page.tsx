import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { LibraryFilters } from "@/components/methodology/library-filters";
import { LibraryList } from "@/components/methodology/library-list";
import { STATUS_LABELS } from "@/components/methodology/labels";
import type { MethodologyStatus } from "@/server/db/schema";
import { listSources } from "@/server/services/sources";
import { listMethodologies } from "@/server/services/methodologies";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

const TABS: MethodologyStatus[] = ["draft", "confirmed", "archived"];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() !== "" ? v : undefined;
}

export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = TABS.find((tab) => tab === first(params.status)) ?? "confirmed";
  const tagId = first(params.tagId);
  const sourceId = first(params.sourceId);
  const q = first(params.q);

  const items = listMethodologies({ status, tagId, sourceId, q });
  const tags = listTags();
  const sources = listSources();
  const counts = Object.fromEntries(
    TABS.map((tab) => [tab, listMethodologies({ status: tab }).length]),
  ) as Record<MethodologyStatus, number>;

  const tabHref = (tab: MethodologyStatus) => {
    const search = new URLSearchParams();
    search.set("status", tab);
    if (tagId) search.set("tagId", tagId);
    if (sourceId) search.set("sourceId", sourceId);
    if (q) search.set("q", q);
    return `/library?${search.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="方法论库"
        description="审阅从资料中抽取的候选方法论，确认后进入方法论库，成为出题的唯一来源。"
      />

      <LinkTabs
        label="方法论状态"
        items={TABS.map((tab) => ({
          key: tab,
          label: `${STATUS_LABELS[tab]}（${counts[tab]}）`,
          href: tabHref(tab),
          active: tab === status,
        }))}
      />

      <LibraryFilters
        status={status}
        tagId={tagId}
        sourceId={sourceId}
        q={q}
        tags={tags}
        sources={sources.map((source) => ({ id: source.id, title: source.title }))}
      />

      <LibraryList
        items={items}
        status={status}
        filtered={Boolean(tagId || sourceId || q)}
        totalInStatus={counts[status]}
      />
    </div>
  );
}
