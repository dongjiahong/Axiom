import { defineConfig, devices } from "playwright/test";

/**
 * E2E 冒烟配置（`AXIOM_FAKE_LLM=1` + 独立数据目录）。
 * 每次运行都用 `db:reset && db:seed` 重建数据目录，保证从零开始、结果可重复。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    // 与 dev server 的 host 保持一致，否则 Next 16 会拦截 127.0.0.1 的 dev 资源与 HMR
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm db:reset && pnpm db:seed && pnpm dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AXIOM_FAKE_LLM: "1",
      AXIOM_DATA_DIR: "./data/e2e",
    },
  },
});
