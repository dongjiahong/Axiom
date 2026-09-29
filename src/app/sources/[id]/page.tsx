import { notFound } from "next/navigation";

import { ChunkTable } from "@/components/sources/chunk-table";
import {
  FORMAT_LABELS,
  formatCharCount,
  SOURCE_STATUS_LABELS,
} from "@/components/sources/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/server/http";
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
        <div className="flex flex-wrap gap-2">
          {/* 抽取相关按钮由 WP4 接入，先禁用 */}
          <Button disabled>开始抽取</Button>
          <Button variant="outline" disabled>
            取消
          </Button>
          <Button variant="outline" disabled>
            重试失败章节
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium">章节块</h2>
        <div className="rounded-lg border">
          <ChunkTable sourceId={detail.id} chunks={detail.chunks} />
        </div>
      </div>
    </div>
  );
}
