import path from "node:path";

import { expect, test, type Page } from "playwright/test";

/**
 * 端到端流程（AXIOM_FAKE_LLM=1，数据目录由 playwright.config.ts 每次重建）。
 * 覆盖：导入资料 → 抽取 → 确认方法论 → 专项练习 → 复盘改判 → 统计。
 */

const TXT_FIXTURE = path.join(__dirname, "../fixtures/sample-gbk.txt");
const METHODOLOGY_NAME = "E2E 练习方法论";
const FIRST_MESSAGE = "我想和你聊聊这次加薪的事情，先说明我的来意。";
const SECOND_MESSAGE = "我今年负责了两个重点项目，希望薪资能调整到一万五。";

/** 导航并等页面加载完成（dev 模式首访需要编译，客户端水合后才能交互）。 */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** 等待练习进入 active 状态并发送一条消息。 */
async function sendMessage(page: Page, content: string) {
  const input = page.getByPlaceholder(/输入你要说的话/);
  await input.fill(content);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("再说说看")).toBeVisible();
}

/** 结束练习并等待复盘页出现（结束后会自动复盘）。 */
async function endAndWaitForDebrief(page: Page) {
  await page.getByRole("button", { name: "结束练习" }).click();
  await page.getByRole("button", { name: "确认结束" }).click();
  await expect(page).toHaveURL(/\/practice\/[^/]+\/debrief$/, { timeout: 60_000 });
}

test("专项练习：导入 → 抽取 → 确认 → 练习 → 复盘改判 → 统计", async ({ page }) => {
  // 1. 导入 txt 夹具
  await open(page, "/sources");
  await page.setInputFiles('input[type="file"]', TXT_FIXTURE);
  const sourceLink = page.locator('a[href^="/sources/"]').first();
  await expect(sourceLink).toBeVisible({ timeout: 30_000 });

  // 2. 抽取
  await sourceLink.click();
  await page.getByRole("button", { name: "开始抽取", exact: true }).click();
  await page.getByRole("button", { name: "确认开始" }).click();
  const draftLink = page.locator('a[href^="/library/"]').first();
  await expect(draftLink).toBeVisible({ timeout: 60_000 });

  // 3. 编辑并确认入库
  await draftLink.click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("方法论名称").fill(METHODOLOGY_NAME);
  await page.getByRole("button", { name: "确认入库" }).click();
  await expect(page.getByRole("button", { name: "退回候选" })).toBeVisible({ timeout: 20_000 });

  // 4. 新建专项练习（指定刚确认的方法论）
  await open(page, "/practice/new");
  await page.getByPlaceholder("搜索方法论名称").fill(METHODOLOGY_NAME);
  await page.locator("label").filter({ hasText: METHODOLOGY_NAME }).click();
  await page.getByRole("button", { name: "生成场景" }).click();

  // 5. 查看提示后开始对话（用 briefing 页的内容等待跳转，避免误匹配 /practice/new）
  await expect(page.getByText(`目标方法论：${METHODOLOGY_NAME}`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "查看方法论骨架" }).click();
  await expect(page.getByText("适用条件")).toBeVisible();
  await page.getByRole("button", { name: "开始对话" }).click();

  // 6. 发两条消息后手动结束
  await sendMessage(page, FIRST_MESSAGE);
  await sendMessage(page, SECOND_MESSAGE);
  await expect(page.getByText("第 2 / 12 轮")).toBeVisible();
  await endAndWaitForDebrief(page);

  // 7. 复盘页显示执行分；「查看场景」弹窗里能看到场景设计说明，随后改判一条要点
  await expect(page.getByTestId("execution-score")).toBeVisible();
  await page.getByRole("button", { name: "查看场景", exact: true }).click();
  await expect(page.getByText("场景设计说明")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "查看场景", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "改判", exact: true }).first().click();
  await page.getByRole("button", { name: "未做到", exact: true }).click();
  await page.getByPlaceholder("改判理由（必填）").fill("E2E：这条要点确实没有做到。");
  await page.getByRole("button", { name: "保存改判" }).click();
  await expect(page.getByText("已改判").first()).toBeVisible();

  // 8. 统计页出现这 1 场练习
  await open(page, "/stats");
  const row = page.getByRole("row").filter({ hasText: METHODOLOGY_NAME });
  await expect(row.locator("td").nth(2)).toHaveText("1");
});


