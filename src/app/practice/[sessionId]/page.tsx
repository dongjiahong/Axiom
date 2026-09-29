import { notFound } from "next/navigation";

import { ActiveView } from "@/components/practice/active-view";
import { BriefingView } from "@/components/practice/briefing-view";
import { EndedView } from "@/components/practice/ended-view";
import { SESSION_STATUS_LABELS } from "@/components/practice/labels";
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
      ) : session.status === "active" ? (
        <ActiveView session={session} />
      ) : (
        <EndedView session={session} />
      )}
    </div>
  );
}
