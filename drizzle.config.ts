import { defineConfig } from "drizzle-kit";
import { join } from "node:path";

/** 数据库文件路径与 src/server/db/client.ts 的 resolveDbPath 保持一致。 */
const dataDir = process.env.AXIOM_DATA_DIR?.trim() || "./data";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: join(dataDir, "axiom.db"),
  },
});
