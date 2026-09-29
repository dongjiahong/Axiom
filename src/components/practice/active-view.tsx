"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/methodology/labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_MAX_CHARS } from "@/domain/constants";
import type {
  MessageResultDto,
  MethodologySkeletonDto,
  SessionDto,
  SessionMessageDto,
} from "@/server/dto/session";

import { Skeleton } from "./briefing-view";
import { MessageBubble } from "./message-list";
import { ScenarioCard } from "./scenario-card";

type Busy = "send" | "regenerate" | "end" | "hint" | null;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** active 状态：对话区、轮数、场景卡、方法论骨架抽屉、结束确认。 */
export function ActiveView({ session }: { session: SessionDto }) {
  const router = useRouter();
  const [messages, setMessages] = useState<SessionMessageDto[]>(session.messages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [showScenario, setShowScenario] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [skeleton, setSkeleton] = useState<MethodologySkeletonDto | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const url = (action: string) => `/api/sessions/${session.id}/${action}`;
  const userCount = messages.filter((m) => m.role === "user").length;
  const replyFailed = busy === null && messages.at(-1)?.role === "user";
  const counterpartName = session.scenario.counterpart.name;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  /** 出错后以服务端为准同步对话（用户消息可能已保存，也可能没有）。 */
  async function resync(): Promise<SessionMessageDto[] | null> {
    try {
      const fresh = await requestJson<SessionDto>(`/api/sessions/${session.id}`);
      setMessages(fresh.messages);
      if (fresh.status !== "active") router.refresh();
      return fresh.messages;
    } catch {
      return null;
    }
  }

  function applyResult(result: MessageResultDto, replaceOptimistic?: string) {
    setMessages((prev) => [...prev.filter((m) => m.id !== replaceOptimistic), ...result.messages]);
    if (result.session.status !== "active") router.refresh();
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy !== null || replyFailed) return;
    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, seq: 0, role: "user", turn: userCount + 1, content },
    ]);
    setDraft("");
    setBusy("send");
    try {
      applyResult(await requestJson<MessageResultDto>(url("messages"), json({ content })), optimisticId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
      const fresh = await resync();
      // 消息没有保存（如校验失败）时把内容还给输入框
      if (fresh && !fresh.some((m) => m.role === "user" && m.content === content && m.turn === userCount + 1)) {
        setDraft(content);
      }
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regenerate");
    try {
      applyResult(await requestJson<MessageResultDto>(url("regenerate"), { method: "POST" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重试失败");
      await resync();
    } finally {
      setBusy(null);
    }
  }

  async function end() {
    setBusy("end");
    try {
      const result = await requestJson<SessionDto | { deleted: true }>(url("end"), { method: "POST" });
      setConfirmEnd(false);
      if ("deleted" in result) {
        toast.info("还没有发言，已放弃本次练习");
        router.push("/practice/new");
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "结束失败");
      setBusy(null);
    }
  }

  async function openHint() {
    setHintOpen(true);
    if (skeleton) return;
    setBusy("hint");
    try {
      setSkeleton(await requestJson<MethodologySkeletonDto>(url("hint"), { method: "POST" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取失败");
      setHintOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">{session.scenario.title}</h2>
          <p className="text-muted-foreground text-sm">
            第 {userCount} / {session.maxTurns} 轮
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowScenario((v) => !v)}>
            {showScenario ? "收起场景" : "展开场景"}
          </Button>
          {session.mode === "drill" ? (
            <Button variant="outline" size="sm" onClick={() => void openHint()} disabled={busy === "hint"}>
              查看方法论骨架
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setConfirmEnd(true)} disabled={busy !== null}>
            结束练习
          </Button>
        </div>
      </div>

      {showScenario ? <ScenarioCard session={session} /> : null}

      <div className="space-y-3 rounded-lg border p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">对方在等你先开口。</p>
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} counterpartName={counterpartName} />
        ))}
        {busy === "send" || busy === "regenerate" ? (
          <p className="text-muted-foreground text-sm">对方正在输入……</p>
        ) : null}
        {replyFailed ? (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-destructive">生成失败</span>
            <Button size="sm" variant="outline" onClick={() => void regenerate()}>
              重试生成回复
            </Button>
          </div>
        ) : null}
        <div ref={bottomRef} className="scroll-mb-40 md:scroll-mb-0" />
      </div>

      {/* 小屏输入框固定在底部，长对话中也能随时输入 */}
      <div className="bg-background sticky bottom-0 -mx-4 space-y-2 border-t px-4 pt-3 pb-3 md:static md:mx-0 md:border-0 md:p-0">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 输入法选词时的回车不发送
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={MESSAGE_MAX_CHARS}
          rows={3}
          disabled={busy !== null || replyFailed}
          placeholder={replyFailed ? "请先重试生成回复" : "输入你要说的话（Enter 发送，Shift+Enter 换行）"}
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {draft.length} / {MESSAGE_MAX_CHARS}
          </span>
          <Button onClick={() => void send()} disabled={busy !== null || replyFailed || !draft.trim()}>
            发送
          </Button>
        </div>
      </div>

      <Dialog open={confirmEnd} onOpenChange={(open) => (busy === "end" ? null : setConfirmEnd(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>结束练习？</DialogTitle>
            <DialogDescription>
              {userCount === 0
                ? "你还没有发言，结束后本次练习会被丢弃。"
                : "结束后不能再继续对话，随后会进入复盘。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEnd(false)} disabled={busy === "end"}>
              继续练习
            </Button>
            <Button onClick={() => void end()} disabled={busy === "end"}>
              {busy === "end" ? "正在结束……" : "确认结束"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={hintOpen} onOpenChange={setHintOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{skeleton?.name ?? "方法论骨架"}</SheetTitle>
            <SheetDescription>已记录为“查看过提示”，统计中会区分。</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {skeleton ? <Skeleton skeleton={skeleton} /> : <p className="text-sm">加载中……</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
