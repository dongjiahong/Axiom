import { asc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db, type AppDatabase } from "@/server/db/client";
import { jobs, sourceChunks, type JobType } from "@/server/db/schema";

import { describeJobError } from "./errors";
import { extractSourceHandler } from "./extract-source";

/** 进程内任务队列：同一时间只运行一个 job，状态持久化在 jobs 表。 */

export type JobRow = typeof jobs.$inferSelect;

export interface JobContext {
  job: JobRow;
  database: AppDatabase;
  /** 用户取消时中止。 */
  signal: AbortSignal;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

export interface JobRunnerOptions {
  database?: AppDatabase;
  handlers?: Partial<Record<JobType, JobHandler>>;
}

export class JobRunner {
  private readonly database: AppDatabase;
  private readonly handlers: Partial<Record<JobType, JobHandler>>;
  private readonly controllers = new Map<string, AbortController>();
  private loop: Promise<void> | null = null;

  constructor(options: JobRunnerOptions = {}) {
    this.database = options.database ?? db;
    this.handlers = options.handlers ?? { extract_source: extractSourceHandler };
  }

  enqueue(type: JobType, payload: JobRow["payload"]): JobRow {
    const row: JobRow = {
      id: nanoid(),
      type,
      payload,
      status: "queued",
      stage: null,
      progressDone: 0,
      progressTotal: 0,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.database.insert(jobs).values(row).run();
    this.kick();
    return row;
  }

  /**
   * 排队中的任务直接标为已取消；运行中的任务中止其 AI 请求，由处理函数收尾后标为已取消；
   * 已结束的任务不变。
   * 单例可能创建于 instrumentation 的独立模块图，其中的 ApiError 与路由里的不是同一个类，
   * 所以这里不抛 ApiError，任务是否存在、能否取消由 service 层判断。
   */
  cancel(jobId: string): JobRow {
    const job = this.getJob(jobId);
    if (job.status === "queued") {
      this.finish(jobId, "cancelled", null);
    } else if (job.status === "running") {
      const controller = this.controllers.get(jobId);
      if (controller) controller.abort();
      else this.finish(jobId, "cancelled", null);
    }
    return this.getJob(jobId);
  }

  /** 服务启动时调用：中断的 job 回到队列，运行中的章节块回到待抽取，然后恢复调度。 */
  recover(): void {
    this.database.update(jobs).set({ status: "queued" }).where(eq(jobs.status, "running")).run();
    this.database
      .update(sourceChunks)
      .set({ extractionStatus: "pending" })
      .where(eq(sourceChunks.extractionStatus, "running"))
      .run();
    this.kick();
  }

  /** 等待队列清空（测试与脚本使用）。 */
  async whenIdle(): Promise<void> {
    while (this.loop) await this.loop;
  }

  private getJob(jobId: string): JobRow {
    const job = this.database.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!job) throw new Error(`任务 ${jobId} 不存在`);
    return job;
  }

  private nextQueued(): JobRow | undefined {
    return this.database
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(asc(jobs.createdAt), sql`rowid`)
      .get();
  }

  private kick(): void {
    if (this.loop) return;
    this.loop = this.drain().finally(() => {
      this.loop = null;
      if (this.nextQueued()) this.kick();
    });
  }

  private async drain(): Promise<void> {
    for (let job = this.nextQueued(); job; job = this.nextQueued()) {
      await this.run(job);
    }
  }

  private async run(job: JobRow): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.database
      .update(jobs)
      .set({ status: "running", startedAt: Date.now(), error: null })
      .where(eq(jobs.id, job.id))
      .run();

    try {
      const handler = this.handlers[job.type];
      if (!handler) throw new Error(`没有 ${job.type} 类型任务的处理函数`);
      await handler({ job, database: this.database, signal: controller.signal });
      this.finish(job.id, "succeeded", null);
    } catch (err) {
      if (controller.signal.aborted) this.finish(job.id, "cancelled", null);
      else this.finish(job.id, "failed", describeJobError(err));
    } finally {
      this.controllers.delete(job.id);
    }
  }

  private finish(jobId: string, status: "succeeded" | "failed" | "cancelled", error: string | null) {
    this.database
      .update(jobs)
      .set({ status, error, finishedAt: Date.now() })
      .where(eq(jobs.id, jobId))
      .run();
  }
}

const GLOBAL_KEY = Symbol.for("axiom.jobRunner");

/** 单例挂在 globalThis 上，避免开发模式热更新产生多个实例。 */
export function getJobRunner(): JobRunner {
  const holder = globalThis as unknown as Record<symbol, JobRunner | undefined>;
  return (holder[GLOBAL_KEY] ??= new JobRunner());
}
