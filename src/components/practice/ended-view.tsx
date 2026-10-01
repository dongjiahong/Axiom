import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionDto } from "@/server/dto/session";

import { DebriefTrigger } from "./debrief-trigger";
import { MessageBubble } from "./message-list";
import { ScenarioCard } from "./scenario-card";

function endReasonText(session: SessionDto): string {
  switch (session.endReason) {
    case "user":
      return "你结束了练习";
    case "turn_limit":
      return "已到达轮数上限";
    case "agreed":
    case "broke_down":
    case "closed":
      return `对方：${session.endNote ?? ""}`;
    default:
      return "练习已结束";
  }
}

/** ended / debrief_failed 状态：显示结束原因与完整对话，并触发（或重试）复盘。 */
export function EndedView({ session }: { session: SessionDto }) {
  return (
    <div className="space-y-4">
      <ScenarioCard session={session} showTitle={false} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">对话已结束：{endReasonText(session)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {session.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              counterpartName={session.scenario.counterpart.name}
            />
          ))}
        </CardContent>
      </Card>
      <DebriefTrigger sessionId={session.id} auto={session.status === "ended"} />
    </div>
  );
}
