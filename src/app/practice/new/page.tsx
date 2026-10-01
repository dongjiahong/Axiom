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
      <PageHeader
        title="开始练习"
        description="设定选题范围与难度后生成场景；对话结束后会评判你做到了哪些要点。"
      />
      <NewPracticeForm
        methodologies={methodologies}
        tags={listTags().map((tag) => ({ id: tag.id, name: tag.name }))}
        sources={sources}
      />
    </div>
  );
}
