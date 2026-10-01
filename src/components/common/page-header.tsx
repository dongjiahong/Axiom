import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 详情页顶部的返回链接。 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-muted-foreground inline-block text-sm hover:underline">
      ← {label}
    </Link>
  );
}

/** 页面顶部：可选返回链接、标题、说明与右侧操作区。 */
export function PageHeader({
  title,
  description,
  back,
  badges,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-2", className)}>
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {badges}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </header>
  );
}
