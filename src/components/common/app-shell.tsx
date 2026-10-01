"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AppNav } from "@/components/common/app-nav";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** 桌面端固定侧栏；小屏改为顶部栏 + 抽屉导航。 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 门禁页还没通过验证，不显示导航。
  if (pathname === "/gate") {
    return <main className="flex min-h-screen items-center justify-center p-4">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-sidebar hidden h-screen w-52 shrink-0 overflow-y-auto border-r md:sticky md:top-0 md:block">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        <AppNav />
      </aside>

      <header className="bg-background sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b px-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="打开导航菜单">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-sidebar w-56 gap-0" showCloseButton={false}>
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <div className="flex h-14 items-center px-4">
              <Logo />
            </div>
            <AppNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Logo />
      </header>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
