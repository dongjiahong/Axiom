import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 列表、表格没有内容时的统一占位：虚线框 + 说明文字 + 可选操作。 */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground space-y-3 rounded-lg border border-dashed p-8 text-center text-sm",
        className,
      )}
    >
      <div>{children}</div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
