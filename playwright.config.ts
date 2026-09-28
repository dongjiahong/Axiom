import { defineConfig, devices } from "playwright/test";

/**
 * E2E 冒烟配置。WP10 在此基础上补充具体的用例与完整流程。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    env: {
      AXIOM_FAKE_LLM: "1",
      AXIOM_DATA_DIR: "./data/e2e",
    },
  },
});
