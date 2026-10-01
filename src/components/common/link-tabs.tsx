import Link from "next/link";

import { cn } from "@/lib/utils";

/** 以链接切换的标签栏：状态放在 URL 里（刷新、分享、前进后退都保持）。 */
export function LinkTabs({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
            item.active
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
