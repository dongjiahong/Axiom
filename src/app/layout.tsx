import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppNav } from "@/components/common/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Axiom",
  description: "把书籍中的沟通方法论抽取成骨架，再用多轮角色扮演进行练习与评判。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <TooltipProvider>
          <div className="flex min-h-screen">
            <aside className="bg-sidebar w-52 shrink-0 border-r">
              <div className="flex h-14 items-center px-4 text-base font-semibold">
                Axiom
              </div>
              <AppNav />
            </aside>
            <main className="min-w-0 flex-1 p-6">
              <div className="mx-auto max-w-[1100px]">{children}</div>
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
