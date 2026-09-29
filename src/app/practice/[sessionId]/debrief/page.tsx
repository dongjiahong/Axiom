import { notFound, redirect } from "next/navigation";

import { DebriefView } from "@/components/debrief/debrief-view";
import { ApiError } from "@/server/http";
import { getDebrief } from "@/server/services/debrief";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function DebriefPage({ params }: Props) {
  const { sessionId } = await params;

  let debrief;
  try {
    debrief = getDebrief(sessionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // 练习存在但还没有复盘：回到练习页（会在那里触发复盘）
      const { getSession } = await import("@/server/services/practice");
      try {
        getSession(sessionId);
      } catch {
        notFound();
      }
      redirect(`/practice/${sessionId}`);
    }
    throw err;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">复盘</h1>
      <DebriefView initial={debrief} />
    </div>
  );
}
