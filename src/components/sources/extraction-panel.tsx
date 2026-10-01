"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { JobDto } from "@/server/dto/job";
import type { SourceJobDto } from "@/server/dto/source";

const POLL_INTERVAL_MS = 2000;

type JobLike = SourceJobDto;

function isActiveStatus(status: JobLike["status"] | undefined): boolean {
  return status === "queued" || status === "running";
}

function isActive(job: JobLike | null | undefined): boolean {
  return isActiveStatus(job?.status);
}

async function fetchJob(url: string): Promise<JobDto> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "无法读取任务进度");
  return data;
}

async function post(url: string): Promise<JobDto> {
  const res = await fetch(url, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "操作失败");
  return data;
}

function progressLabel(job: JobLike): string {
  switch (job.status) {
    case "queued":
      return "排队中";
    case "cancelled":
      return "已取消";
    case "failed":
      return `抽取失败：${job.error ?? "未知错误"}`;
    case "succeeded":
      return "完成";
    case "running":
      break;
  }
  switch (job.stage) {
    case "cluster":
      return "去重中";
    case "merge":
      return "合并中";
    case "done":
      return "完成";
    default:
      return `抽取章节 ${job.progressDone}/${job.progressTotal}`;
  }
}

function progressValue(job: JobLike): number {
  if (job.status === "queued") return 0;
  if (job.stage === "cluster" || job.stage === "merge" || job.stage === "done") return 100;
  return job.progressTotal === 0 ? 0 : Math.round((job.progressDone / job.progressTotal) * 100);
}

export function ExtractionPanel({
  sourceId,
  initialJob,
  pendingCount,
  failedCount,
  pendingChars,
  pendingTokens,
}: {
  sourceId: string;
  initialJob: SourceJobDto | null;
  /** 待抽取的章节块数。 */
  pendingCount: number;
  failedCount: number;
  pendingChars: number;
  /** 待抽取部分的预估 token（粗略估计）。 */
  pendingTokens: number;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(isActive(initialJob) ? initialJob!.id : null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: polled, mutate } = useSWR<JobDto>(jobId ? `/api/jobs/${jobId}` : null, fetchJob, {
    refreshInterval: (latest) => (latest && !isActive(latest) ? 0 : POLL_INTERVAL_MS),
    revalidateOnFocus: false,
  });
  const job: JobLike | null = polled ?? initialJob;
  const active = isActive(job);

  const previousStatus = useRef(job?.status);
  useEffect(() => {
    if (previousStatus.current !== job?.status && isActiveStatus(previousStatus.current)) {
      if (job?.status === "succeeded") toast.success("抽取完成");
      if (job?.status === "failed") toast.error("抽取失败");
      if (job?.status === "cancelled") toast.message("抽取已取消");
      router.refresh();
    }
    previousStatus.current = job?.status;
  }, [job?.status, router]);

  // 进度变化时刷新服务端渲染的章节块表格与候选方法论列表
  const chunkProgress = polled?.progressDone;
  useEffect(() => {
    if (chunkProgress !== undefined) router.refresh();
  }, [chunkProgress, router]);

  async function start() {
    setBusy(true);
    try {
      const created = await post(`/api/sources/${sourceId}/extract`);
      setJobId(created.id);
      await mutate(created, { revalidate: false });
      setConfirming(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setBusy(true);
    try {
      await post(`/api/jobs/${job.id}/cancel`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={active || busy || pendingCount === 0} onClick={() => setConfirming(true)}>
          开始抽取
        </Button>
        <Button variant="outline" disabled={!active || busy} onClick={() => void cancel()}>
          取消
        </Button>
        <Button
          variant="outline"
          disabled={active || busy || failedCount === 0}
          onClick={() => void start()}
        >
          重试失败章节{failedCount > 0 ? `（${failedCount}）` : ""}
        </Button>
      </div>

      {job ? (
        <div className="space-y-1">
          <Progress value={progressValue(job)} />
          <p className={job.status === "failed" ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
            {progressLabel(job)}
          </p>
        </div>
      ) : null}

      {!active && failedCount > 0 ? (
        <p className="text-sm text-warning">{failedCount} 个章节抽取失败，可点击“重试失败章节”。</p>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>开始抽取</DialogTitle>
            <DialogDescription>
              将处理 {pendingCount} 个章节块（共 {pendingChars.toLocaleString("zh-CN")} 字），预估约{" "}
              {pendingTokens.toLocaleString("zh-CN")} token（粗略估计，未含输出与去重合并）。抽取会调用已配置的
              AI 模型，确认开始吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              再想想
            </Button>
            <Button disabled={busy} onClick={() => void start()}>
              确认开始
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
