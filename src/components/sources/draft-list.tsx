import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { SourceDraftDto } from "@/server/dto/extraction";

const CREATED_BY_LABELS: Record<string, string> = {
  extraction: "抽取",
  merge: "自动合并",
  split: "拆分",
  manual: "手动",
  seed: "种子",
};

export function DraftList({ drafts }: { drafts: SourceDraftDto[] }) {
  if (drafts.length === 0) {
    return <p className="text-muted-foreground text-sm">还没有候选方法论。完成抽取后会显示在这里。</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {drafts.map((draft) => (
        <li key={draft.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Link href={`/library/${draft.id}`} className="font-medium hover:underline">
            {draft.name}
          </Link>
          {draft.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
          <span className="text-muted-foreground text-sm">{draft.stepCount} 个步骤</span>
          <Badge variant="outline">{CREATED_BY_LABELS[draft.createdBy] ?? draft.createdBy}</Badge>
          {draft.inferredCount > 0 ? (
            <Badge variant="outline">{draft.inferredCount} 处 AI 推断</Badge>
          ) : null}
          {draft.unmatchedExcerptCount > 0 ? (
            <Badge variant="outline" className="border-warning text-warning">
              {draft.unmatchedExcerptCount} 处摘录未匹配
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
