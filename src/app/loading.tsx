import { Skeleton } from "@/components/ui/skeleton";

/** 全局加载态：页面路由切换时的骨架屏。 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
