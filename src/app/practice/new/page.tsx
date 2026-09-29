import { NewPracticeForm } from "@/components/practice/new-practice-form";
import { listSources } from "@/server/services/sources";
import { loadConfirmedMethodologies } from "@/server/services/scenarios";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mode?: string }> };

export default async function NewPracticePage({ searchParams }: Props) {
  const { mode } = await searchParams;
  const methodologies = loadConfirmedMethodologies().map((m) => ({
    id: m.id,
    name: m.name,
    sourceId: m.sourceId,
    tagIds: m.tagIds,
  }));
  const sources = listSources().map((source) => ({ id: source.id, title: source.title }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">开始练习</h1>
        <p className="text-muted-foreground text-sm">
          选择专项练习或综合测验，设定选题范围与难度后生成场景。
        </p>
      </div>
      <NewPracticeForm
        initialMode={mode === "quiz" ? "quiz" : "drill"}
        methodologies={methodologies}
        tags={listTags().map((tag) => ({ id: tag.id, name: tag.name }))}
        sources={sources}
      />
    </div>
  );
}
