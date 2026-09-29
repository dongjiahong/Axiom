import { GateForm } from "@/components/common/gate-form";
import { safeNext } from "@/server/gate";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function GatePage({ searchParams }: Props) {
  const { next } = await searchParams;
  return <GateForm next={safeNext(Array.isArray(next) ? next[0] : next)} />;
}
