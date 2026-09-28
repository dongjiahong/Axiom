/**
 * 强制 Fake 模式（AXIOM_FAKE_LLM=1），返回还原函数。
 * 用法：`const restore = withFakeLLM(); afterAll(restore);`
 */
export function withFakeLLM(): () => void {
  const previous = process.env.AXIOM_FAKE_LLM;
  process.env.AXIOM_FAKE_LLM = "1";
  return () => {
    if (previous === undefined) {
      delete process.env.AXIOM_FAKE_LLM;
    } else {
      process.env.AXIOM_FAKE_LLM = previous;
    }
  };
}
