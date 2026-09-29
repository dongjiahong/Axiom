import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** 未配置 AI 模型时显示在首页顶部，引导去设置页。 */
export function LLMNotConfiguredBanner() {
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>还没有配置 AI 模型</AlertTitle>
      <AlertDescription>
        抽取方法论、生成场景和复盘都需要 AI 模型。
        <Link href="/settings" className="ml-1 font-medium underline underline-offset-4">
          前往设置
        </Link>
      </AlertDescription>
    </Alert>
  );
}
