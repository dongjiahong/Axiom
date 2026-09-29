import { notFound } from "next/navigation";

import { ChunkTable } from "@/components/sources/chunk-table";
import { DraftList, MergeSuggestionList } from "@/components/sources/draft-list";
import { ExtractionPanel } from "@/components/sources/extraction-panel";
import {
  FORMAT_LABELS,
  formatCharCount,
  SOURCE_STATUS_LABELS,
} from "@/components/sources/labels";
import { Badge } from "@/components/ui/badge";
import { TOKEN_ESTIMATE_PER_CHAR } from "@/domain/constants";
import { ApiError } from "@/server/http";
import { listMergeSuggestions, listSourceDrafts } from "@/server/services/extraction";
import { getSourceDetail } from "@/server/services/sources";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function SourceDetailPage({ params }: Props) {
  const { id } = await params;

  let detail;
  try {
    detail = getSourceDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const pending = detail.chunks.filter((chunk) => chunk.extractionStatus === "pending");
  const failedCount = detail.chunks.filter((chunk) => chunk.extractionStatus === "failed").length;
  const pendingChars = pending.reduce((sum, chunk) => sum + chunk.charCount, 0);
  const drafts = listSourceDrafts(id);
  const suggestions = listMergeSuggestions(id);
  const notSkipped = detail.chunks.filter((chunk) => chunk.extractionStatus !== "skipped").length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{detail.title}</h1>
          <Badge variant="secondary">{FORMAT_LABELS[detail.format]}</Badge>
          <Badge variant={detail.status === "failed" ? "destructive" : "outline"}>
            {SOURCE_STATUS_LABELS[detail.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {detail.author ? `${detail.author} · ` : ""}
          {formatCharCount(detail.charCount)} · {detail.chunks.length} 个章节块（{notSkipped} 个待抽取）
          · 预估 {detail.estimatedTokens.toLocaleString("zh-CN")} token（粗略估计）
        </p>
        <ExtractionPanel
          sourceId={detail.id}
          initialJob={detail.job}
          pendingCount={pending.length}
          failedCount={failedCount}
          pendingChars={pendingChars}
          pendingTokens={Math.round(pendingChars * TOKEN_ESTIMATE_PER_CHAR)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">章节块</h2>
        <div className="rounded-lg border">
          <ChunkTable sourceId={detail.id} chunks={detail.chunks} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">本资料的候选方法论（{drafts.length}）</h2>
        <DraftList drafts={drafts} />
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">合并建议（{suggestions.length}）</h2>
          <MergeSuggestionList suggestions={suggestions} />
        </div>
      ) : null}
    </div>
  );
}
