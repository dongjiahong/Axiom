/** 服务启动时恢复中断的抽取任务。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getJobRunner } = await import("@/server/jobs/runner");
  getJobRunner().recover();

  const { gatePassword } = await import("@/server/gate");
  if (process.env.NODE_ENV === "production" && !gatePassword()) {
    console.warn("[axiom] 未设置 AXIOM_ACCESS_PASSWORD，应用没有门禁，任何能访问该地址的人都可以使用。");
  }
}
