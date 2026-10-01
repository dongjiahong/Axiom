import { Skeleton } from "@/components/ui/skeleton";

/** 复盘页加载态：顶栏 + 左侧评判 + 右侧对话。 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="hidden h-96 w-full lg:block" />
      </div>
    </div>
  );
}
