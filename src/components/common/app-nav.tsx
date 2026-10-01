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

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NEW_PRACTICE_HREF = "/practice/new";

/** 练习页（/practice/<id>）归在「历史」下；新建练习有自己的主按钮。 */
const isSessionPath = (pathname: string) =>
  pathname.startsWith("/practice/") && pathname !== NEW_PRACTICE_HREF;

const NAV_ITEMS = [
  { href: "/", label: "首页", icon: House },
  { href: "/sources", label: "资料", icon: BookOpen },
  { href: "/library", label: "方法论库", icon: Library },
  { href: "/history", label: "历史", icon: History, also: isSessionPath },
  { href: "/stats", label: "统计", icon: ChartColumn },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      <Button asChild className="mb-2 w-full" variant={pathname === NEW_PRACTICE_HREF ? "secondary" : "default"}>
        <Link href={NEW_PRACTICE_HREF} onClick={onNavigate}>
          <Play />
          开始练习
        </Link>
      </Button>
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (item.also?.(pathname) ?? false);
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
