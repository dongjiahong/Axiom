import { existsSync, rmSync } from "node:fs";

import { closeDatabase, createDatabase, resolveDbPath } from "../src/server/db/client";

/** 删除数据库文件（含 WAL 附属文件）后重新迁移。 */

closeDatabase();

const dbPath = resolveDbPath();
for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (existsSync(file)) {
    rmSync(file);
  }
}

createDatabase();
console.log(`已删除并重建数据库：${dbPath}`);
