import Link from "next/link";
import { notFound } from "next/navigation";

import { BriefingView } from "@/components/practice/briefing-view";
import { SESSION_STATUS_LABELS } from "@/components/practice/labels";
import { ScenarioCard } from "@/components/practice/scenario-card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/server/http";
import { getSession } from "@/server/services/practice";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function PracticePage({ params }: Props) {
  const { sessionId } = await params;

  let session;
  try {
    session = getSession(sessionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">练习</h1>
        <Badge variant="outline">{SESSION_STATUS_LABELS[session.status]}</Badge>
      </div>
      {session.status === "briefing" ? (
        <BriefingView session={session} />
      ) : (
        <div className="space-y-4">
          <ScenarioCard session={session} />
          <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-sm">
            对话功能开发中。
            <Link href="/practice/new" className="text-foreground ml-1 underline">
              返回新建练习
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
