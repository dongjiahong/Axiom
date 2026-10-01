import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { STATUS_LABELS } from "@/components/methodology/labels";
import { Badge } from "@/components/ui/badge";
import type { MethodologyDetailDto } from "@/server/dto/methodology";
import { ApiError } from "@/server/http";
import { getMethodology } from "@/server/services/methodologies";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function load(id: string | undefined): MethodologyDetailDto | null {
  if (!id) return null;
  try {
    return getMethodology(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const a = load(param(params.a));
  const b = load(param(params.b));

  if (!a || !b) {
    return (
      <div className="space-y-4">
        <PageHeader
          back={{ href: "/library", label: "方法论库" }}
          title="方法论对比"
          description="请在方法论库中勾选 2 个方法论后点击“对比所选”。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/library", label: "方法论库" }}
        title="方法论对比"
        description="并排查看两个方法论的适用条件、反例、步骤与原则，用来分清它们各自适合什么情境。"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Column methodology={a} />
        <Column methodology={b} />
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <section className="space-y-1">
      <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">（无）</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Column({ methodology }: { methodology: MethodologyDetailDto }) {
  const { body } = methodology;
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/library/${methodology.id}`} className="text-lg font-medium hover:underline">
            {methodology.name}
          </Link>
          <Badge variant="outline">{STATUS_LABELS[methodology.status]}</Badge>
          {methodology.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
        {body.summary ? <p className="text-muted-foreground text-sm">{body.summary}</p> : null}
      </div>
      <Section title="适用条件" items={body.applicability.map((item) => item.text)} />
      <Section title="反例" items={body.counterIndications.map((item) => item.text)} />
      <Section
        title={`步骤（${body.orderMode === "strict" ? "严格顺序" : "顺序不敏感"}）`}
        items={body.steps.map((step) => (
          <span key={step.id}>
            {step.title}
            {step.conditional ? (
              <Badge variant="outline" className="ml-2">
                条件步骤{step.trigger ? `：${step.trigger}` : ""}
              </Badge>
            ) : null}
          </span>
        ))}
      />
      <Section
        title="原则"
        items={body.principles.map((principle) => `${principle.kind === "do" ? "要做" : "禁忌"}：${principle.text}`)}
      />
    </div>
  );
}
