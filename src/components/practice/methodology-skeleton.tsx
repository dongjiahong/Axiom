import { Badge } from "@/components/ui/badge";
import type { MethodologySkeletonDto } from "@/server/dto/session";

/** 方法论骨架的只读展示：练习前后的提示抽屉与复盘里的方法论弹窗共用。 */
export function MethodologySkeletonView({ skeleton }: { skeleton: MethodologySkeletonDto }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">{skeleton.summary}</p>
      <div>
        <h4 className="font-medium">适用条件</h4>
        <ul className="text-muted-foreground list-disc pl-5">
          {skeleton.applicability.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <h4 className="font-medium">
          步骤{" "}
          <span className="text-muted-foreground font-normal">
            （{skeleton.orderMode === "strict" ? "严格顺序" : "顺序不敏感"}）
          </span>
        </h4>
        {skeleton.steps.map((step, i) => (
          <div key={i} className="rounded-md border p-3">
            <div className="flex items-center gap-2 font-medium">
              {i + 1}. {step.title}
              {step.conditional ? <Badge variant="outline">条件步骤</Badge> : null}
            </div>
            {step.conditional && step.trigger ? (
              <p className="text-muted-foreground text-xs">触发：{step.trigger}</p>
            ) : null}
            <ul className="text-muted-foreground mt-1 list-disc pl-5">
              {step.keyPoints.map((text, j) => (
                <li key={j}>{text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {skeleton.principles.length > 0 ? (
        <div>
          <h4 className="font-medium">原则</h4>
          <ul className="text-muted-foreground list-disc pl-5">
            {skeleton.principles.map((p, i) => (
              <li key={i}>
                {p.kind === "do" ? "要做：" : "禁忌："}
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
