import { describe, expect, it } from "vitest";

/**
 * 确认左侧导航对应的页面模块都存在且可被加载。
 */
const PAGE_MODULES = [
  "@/app/page",
  "@/app/sources/page",
  "@/app/library/page",
  "@/app/practice/new/page",
  "@/app/history/page",
  "@/app/stats/page",
  "@/app/settings/page",
];

describe("页面骨架", () => {
  it.each(PAGE_MODULES)("%s 导出默认页面组件", async (modulePath) => {
    const mod = (await import(modulePath)) as { default?: unknown };
    expect(typeof mod.default).toBe("function");
  });
});
