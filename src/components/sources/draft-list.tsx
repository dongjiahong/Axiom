import { Badge } from "@/components/ui/badge";
import type { MergeSuggestionDto, SourceDraftDto } from "@/server/dto/extraction";

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
          <span className="font-medium">{draft.name}</span>
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
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {draft.unmatchedExcerptCount} 处摘录未匹配
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** 接受/忽略按钮依赖方法论库的接口，待其就绪后再接入。 */
export function MergeSuggestionList({ suggestions }: { suggestions: MergeSuggestionDto[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {suggestions.map((suggestion) => (
        <li key={suggestion.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {suggestion.members.map((member) => (
              <Badge key={member.id} variant="secondary">
                {member.name}
              </Badge>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">{suggestion.reason}</p>
        </li>
      ))}
    </ul>
  );
}
