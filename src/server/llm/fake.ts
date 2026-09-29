/** AXIOM_FAKE_LLM=1 时，所有任务返回确定性的假数据，无需配置 AI 端点。 */
export function isFakeLLM(): boolean {
  return process.env.AXIOM_FAKE_LLM === "1";
}
