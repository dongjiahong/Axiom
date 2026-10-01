import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionDto } from "@/server/dto/session";

import { DIFFICULTY_LABELS } from "./labels";

/** 场景卡：只含可见字段（标题、背景、你的角色、你的目标、对方是谁、难度）。页面标题已显示场景名时可隐藏头部。 */
export function ScenarioCard({ session, showTitle = true }: { session: SessionDto; showTitle?: boolean }) {
  const { scenario } = session;
  return (
    <Card>
      {showTitle ? (
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{scenario.title}</CardTitle>
            <Badge variant="outline">难度：{DIFFICULTY_LABELS[session.difficulty]}</Badge>
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-4 text-sm">
        <section className="space-y-1">
          <h3 className="font-medium">背景</h3>
          <p className="text-muted-foreground whitespace-pre-wrap">{scenario.background}</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-medium">你的角色</h3>
          <p className="text-muted-foreground">{scenario.userRole}</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-medium">你的目标</h3>
          <p className="text-muted-foreground">{scenario.userGoal}</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-medium">对方是谁</h3>
          <p className="text-muted-foreground">
            {scenario.counterpart.name}（{scenario.counterpart.relation}）：{scenario.counterpart.profile}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
