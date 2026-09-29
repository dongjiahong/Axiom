"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChartColumn,
  History,
  House,
  Library,
  Play,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "首页", icon: House },
  { href: "/sources", label: "资料", icon: BookOpen },
  { href: "/library", label: "方法论库", icon: Library },
  { href: "/practice/new", label: "开始练习", icon: Play },
  { href: "/history", label: "历史", icon: History },
  { href: "/stats", label: "统计", icon: ChartColumn },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
