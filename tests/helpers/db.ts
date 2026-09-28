import type { AppDb } from "@/server/db/client";
import { createDatabase } from "@/server/db/client";

/**
 * 集成测试基座（work-packages.md 通用完成标准）：
 * `createTestDb()` 返回迁移完成的内存数据库，用完请调用 `close()`。
 */
export type TestDb = AppDb;

export function createTestDb(): TestDb {
  return createDatabase(":memory:");
}
