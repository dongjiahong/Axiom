import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import * as schema from "./schema";

/** 数据库连接与单例：路径取自 `AXIOM_DATA_DIR`（默认 `./data`）。 */

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** 一个数据库连接（drizzle 实例 + 底层 better-sqlite3 连接）。 */
export interface AppDb {
  db: AppDatabase;
  sqlite: Database.Database;
  close: () => void;
}

/** 迁移文件目录（drizzle-kit 生成，见 drizzle.config.ts）。 */
export const MIGRATIONS_FOLDER = join(process.cwd(), "src/server/db/migrations");

/** 数据库文件路径：`${AXIOM_DATA_DIR}/axiom.db`。 */
export function resolveDbPath(): string {
  const dataDir = process.env.AXIOM_DATA_DIR?.trim() || "./data";
  return join(dataDir, "axiom.db");
}

/**
 * 打开数据库：自动建目录、开启 WAL 与外键、执行迁移。
 * 传入 `':memory:'` 时得到内存数据库（测试基座 createTestDb 使用）。
 */
export function createDatabase(filePath: string = resolveDbPath()): AppDb {
  const inMemory = filePath === ":memory:";
  if (!inMemory) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  if (!inMemory) {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite, close: () => sqlite.close() };
}

const connection = createDatabase();

/** 全局单例。 */
export const db = connection.db;

/** 关闭单例连接（脚本收尾时调用）。 */
export function closeDatabase(): void {
  connection.close();
}
