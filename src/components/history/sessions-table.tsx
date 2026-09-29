"use client";

import Link from "next/link";

import { RECOGNITION_LABELS } from "@/components/debrief/labels";
import { DIFFICULTY_LABELS, MODE_LABELS, SESSION_STATUS_LABELS } from "@/components/practice/labels";
import { RetryButton } from "@/components/practice/practice-actions";
import { formatDateTime } from "@/components/sources/labels";
import { formatScore, OUTCOME_SHORT_LABELS } from "@/components/stats/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionListItemDto } from "@/server/dto/session";

/** 历史与首页「最近练习」共用的列表文案（中文，与 CONTEXT.md 术语一致）。 */

/** 会话条目对应的入口：已复盘去看复盘，其余回到练习页（该页会触发/重试复盘）。 */
function sessionHref(item: SessionListItemDto): string {
  return item.status === "debriefed"
    ? `/practice/${item.id}/debrief`
    : `/practice/${item.id}`;
}

function sessionActionLabel(item: SessionListItemDto): string {
  if (item.status === "debriefed") return "查看复盘";
  if (item.status === "ended" || item.status === "debrief_failed") return "去复盘";
  return "继续";
}

function StatusBadge({ item }: { item: SessionListItemDto }) {
  return (
    <Badge variant={item.status === "debrief_failed" ? "destructive" : "outline"}>
      {SESSION_STATUS_LABELS[item.status]}
    </Badge>
  );
}

/** 再练一次：以同一场景新建一场练习（api-and-ui.md §4.9、§4.10）。 */
export function SessionsTable({ items }: { items: SessionListItemDto[] }) {
  return (
    <>
      <SessionCards items={items} />
      <SessionsDesktopTable items={items} />
    </>
  );
}

/** 小屏：每场练习一张卡片，关键信息与操作都在屏内。 */
function SessionCards({ items }: { items: SessionListItemDto[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((item) => (
        <li key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <Link href={sessionHref(item)} className="font-medium hover:underline">
              {item.scenarioTitle}
            </Link>
            <StatusBadge item={item} />
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>{formatDateTime(item.createdAt)}</span>
            <span>{MODE_LABELS[item.mode]}</span>
            <span>难度：{DIFFICULTY_LABELS[item.difficulty]}</span>
          </div>
          {item.methodologyName ? <p className="text-xs">方法论：{item.methodologyName}</p> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              执行分 <b className="tabular-nums">{formatScore(item.executionScore)}</b>
            </span>
            {item.recognition !== null ? <span>识别：{RECOGNITION_LABELS[item.recognition]}</span> : null}
            {item.outcome !== null ? <span>说服结果：{OUTCOME_SHORT_LABELS[item.outcome]}</span> : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link href={sessionHref(item)}>{sessionActionLabel(item)}</Link>
            </Button>
            <RetryButton scenarioId={item.scenarioId} size="sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SessionsDesktopTable({ items }: { items: SessionListItemDto[] }) {
  return (
    <div className="hidden rounded-lg border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>场景</TableHead>
            <TableHead>模式</TableHead>
            <TableHead>难度</TableHead>
            <TableHead>所用方法论</TableHead>
            <TableHead className="text-right">执行分</TableHead>
            <TableHead>识别</TableHead>
            <TableHead>说服结果</TableHead>
            <TableHead>状态</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {formatDateTime(item.createdAt)}
              </TableCell>
              <TableCell className="max-w-64">
                <Link href={sessionHref(item)} className="font-medium hover:underline">
                  {item.scenarioTitle}
                </Link>
              </TableCell>
              <TableCell>{MODE_LABELS[item.mode]}</TableCell>
              <TableCell>{DIFFICULTY_LABELS[item.difficulty]}</TableCell>
              <TableCell>{item.methodologyName ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatScore(item.executionScore)}
              </TableCell>
              <TableCell>
                {item.recognition === null ? "—" : RECOGNITION_LABELS[item.recognition]}
              </TableCell>
              <TableCell>
                {item.outcome === null ? "—" : OUTCOME_SHORT_LABELS[item.outcome]}
              </TableCell>
              <TableCell>
                <StatusBadge item={item} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={sessionHref(item)}>{sessionActionLabel(item)}</Link>
                  </Button>
                  <RetryButton scenarioId={item.scenarioId} size="sm" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** 首页「最近练习」：紧凑列表。 */
export function RecentSessions({ items }: { items: SessionListItemDto[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <Link href={sessionHref(item)} className="min-w-0 flex-1 truncate font-medium hover:underline">
            {item.scenarioTitle}
          </Link>
          <span className="text-muted-foreground">{MODE_LABELS[item.mode]}</span>
          <span className="text-muted-foreground">{DIFFICULTY_LABELS[item.difficulty]}</span>
          <span className="text-muted-foreground tabular-nums">
            执行分 {formatScore(item.executionScore)}
          </span>
          <StatusBadge item={item} />
          <span className="text-muted-foreground tabular-nums">{formatDateTime(item.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
