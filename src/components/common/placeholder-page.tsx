import type { ReactNode } from "react";

/**
 * 占位页面（目前没有页面在用）。
 */
export function PlaceholderPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-sm">
        {children ?? "功能开发中。"}
      </div>
    </div>
  );
}
