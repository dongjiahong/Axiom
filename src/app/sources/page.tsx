import { SourcesList } from "@/components/sources/sources-list";
import { listSources } from "@/server/services/sources";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const sources = listSources();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">资料</h1>
        <p className="text-muted-foreground text-sm">
          导入书籍或文字稿，解析出章节块供 AI 抽取方法论。
        </p>
      </div>
      <SourcesList initial={sources} />
    </div>
  );
}
