import { Skeleton } from "@/components/ui/skeleton";

/** 练习页加载态：标题 + 场景/对话区。 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
