import type { SessionListItemDto } from "@/server/dto/session";

/** 会话条目对应的入口：已复盘去看复盘，其余回到练习页（该页会触发/重试复盘）。 */
export function sessionHref(item: SessionListItemDto): string {
  return item.status === "debriefed" ? `/practice/${item.id}/debrief` : `/practice/${item.id}`;
}

export function sessionActionLabel(item: SessionListItemDto): string {
  if (item.status === "debriefed") return "查看复盘";
  if (item.status === "ended" || item.status === "debrief_failed") return "去复盘";
  return "继续";
}
