import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ActiveView } from "@/components/practice/active-view";
import { BriefingView } from "@/components/practice/briefing-view";
import { EndedView } from "@/components/practice/ended-view";
import { DIFFICULTY_LABELS, SESSION_STATUS_LABELS } from "@/components/practice/labels";
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

  if (session.status === "debriefed") redirect(`/practice/${sessionId}/debrief`);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/history", label: "历史" }}
        title={session.scenario.title}
        badges={
          <>
            <Badge variant="outline">{SESSION_STATUS_LABELS[session.status]}</Badge>
            <Badge variant="outline">难度：{DIFFICULTY_LABELS[session.difficulty]}</Badge>
          </>
        }
      />
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
