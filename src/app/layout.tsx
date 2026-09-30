import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/common/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Axiom",
  description: "把书籍中的沟通方法论抽取成骨架，再用多轮角色扮演进行练习与评判。",
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#101112",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
