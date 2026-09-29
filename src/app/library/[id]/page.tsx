import Link from "next/link";
import { notFound } from "next/navigation";

import { MethodologyEditor } from "@/components/methodology/methodology-editor";
import { ApiError } from "@/server/http";
import { getMethodology } from "@/server/services/methodologies";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function MethodologyPage({ params }: Props) {
  const { id } = await params;

  let methodology;
  try {
    methodology = getMethodology(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-4">
      <Link href="/library" className="text-muted-foreground text-sm hover:underline">
        ← 方法论库
      </Link>
      <MethodologyEditor initial={methodology} allTags={listTags().map((tag) => tag.name)} />
    </div>
  );
}
