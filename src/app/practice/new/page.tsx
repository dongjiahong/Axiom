import { PageHeader } from "@/components/common/page-header";
import { NewPracticeForm } from "@/components/practice/new-practice-form";
import { listSources } from "@/server/services/sources";
import { loadConfirmedMethodologies } from "@/server/services/scenarios";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

export default async function NewPracticePage() {
  const methodologies = loadConfirmedMethodologies().map((m) => ({
    id: m.id,
    name: m.name,
    sourceId: m.sourceId,
    tagIds: m.tagIds,
  }));
  const sources = listSources().map((source) => ({ id: source.id, title: source.title }));

  return (
    <div className="space-y-4">
      <PageHeader title="开始练习" />
      <div className="max-w-3xl">
        <NewPracticeForm
          methodologies={methodologies}
          tags={listTags().map((tag) => ({ id: tag.id, name: tag.name }))}
          sources={sources}
        />
      </div>
    </div>
  );
}
