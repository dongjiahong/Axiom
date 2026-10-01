import { PageHeader } from "@/components/common/page-header";
import { SourcesList } from "@/components/sources/sources-list";
import { listSources } from "@/server/services/sources";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const sources = listSources();

  return (
    <div className="space-y-4">
      <PageHeader title="资料" description="导入书籍或文字稿，解析出章节块供 AI 抽取方法论。" />
      <SourcesList initial={sources} />
    </div>
  );
}
