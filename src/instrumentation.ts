/** 服务启动时恢复中断的抽取任务（api-and-ui.md §2.1）。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getJobRunner } = await import("@/server/jobs/runner");
  getJobRunner().recover();
}
