"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">页面出错了</h1>
      <p className="text-muted-foreground text-sm">请重试一次；如果仍然出错，可以先回到首页。</p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>重试</Button>
        <Button variant="outline" asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
