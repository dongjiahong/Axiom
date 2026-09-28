# 交付说明

按工作包顺序记录。每节包含：完成内容、验证方式、已知限制、对公共契约的改动。

## WP0 · 项目脚手架

### 完成内容

1. **Next.js 脚手架**：App Router、TypeScript strict、Tailwind CSS v4、ESLint（`eslint-config-next` 的 core-web-vitals + typescript）、`src/` 目录、`@/* → src/*` 别名。包管理器 pnpm，`package.json` 声明 `engines.node >= 22`。
   - 版本：Next.js 16.3.6、React 19.2.8、Tailwind CSS 4.3.3、TypeScript 5.9。
2. **shadcn/ui**：以 Radix 为底层、`radix-nova` 预设初始化，已添加全部 22 个组件：button、input、textarea、label、card、badge、dialog、sheet、tabs、table、select、checkbox、switch、radio-group、dropdown-menu、tooltip、progress、sonner、separator、scroll-area、skeleton、alert（均在 `src/components/ui/`）。
3. **依赖**：drizzle-orm、better-sqlite3（含 `@types/better-sqlite3`）、drizzle-kit、zod、nanoid、openai、jsonrepair、jszip、fast-xml-parser、cheerio、unpdf、chardet、iconv-lite、react-hook-form、@hookform/resolvers、swr、recharts、lucide-react；开发依赖 vitest、@vitest/coverage-v8、playwright、tsx、prettier。
4. **构建配置**：`next.config.ts` 设置 `serverExternalPackages: ['better-sqlite3']`；`pnpm-workspace.yaml` 用 `onlyBuiltDependencies` 允许 better-sqlite3 与 esbuild 执行安装脚本（pnpm 10 默认拦截）。
5. **`package.json` scripts**：`dev`、`build`、`start`、`lint`、`typecheck`（`tsc --noEmit`）、`test`（`vitest run`）、`test:watch`、`e2e`、`db:generate`、`db:migrate`、`db:seed`、`db:reset`。
6. **测试与 E2E 配置**：`vitest.config.ts`（node 环境，`@` 别名，收集 `src/**/*.test.ts` 与 `tests/**/*.test.ts`，排除 `tests/e2e/**`）；`playwright.config.ts`（`tests/e2e` 目录、chromium、baseURL `http://127.0.0.1:3100`、webServer 自动启动 `pnpm dev` 并注入 `AXIOM_FAKE_LLM=1` 与独立 `AXIOM_DATA_DIR`）。
7. **`.gitignore`**：追加 `/data/`，并把 `.env*` 的例外收紧为只放行 `.env.example`。
8. **`.env.example`**：`AXIOM_DATA_DIR=./data`、`AXIOM_FAKE_LLM=0`、`AXIOM_LLM_BASE_URL`、`AXIOM_LLM_API_KEY`、`AXIOM_LLM_MODEL`。
9. **基础布局**：`src/app/layout.tsx` 提供左侧导航（首页、资料、方法论库、开始练习、历史、统计、设置）+ 内容区（最大宽度 1100px），中文文案，`lang="zh-CN"`，挂载 `TooltipProvider` 与 `Toaster`。导航项为客户端组件 `src/components/common/app-nav.tsx`（高亮当前路由、`aria-current`）。
10. **占位页面**：`/`、`/sources`、`/library`、`/practice/new`、`/history`、`/stats`、`/settings`，统一用 `src/components/common/placeholder-page.tsx` 渲染中文标题与"功能开发中"提示。
11. **占位测试**：`tests/scaffold.test.ts` 断言上述 7 个页面模块都能加载并导出默认组件。
12. **git**：`git init` 并完成首次提交。

### 验证方式

```
pnpm lint        # 通过，无告警
pnpm typecheck   # 通过
pnpm test        # 1 个文件 / 7 个用例通过
pnpm build       # 通过，7 个页面全部预渲染成功
pnpm e2e         # 退出码 0（WP0 尚无 E2E 用例）
pnpm dev         # 逐个访问 / /sources /library /practice/new /history /stats /settings 均返回 200
```

`git log` 可看到以 `WP0:` 开头的首次提交。

### 已知限制

- `db:seed` / `db:reset` / `db:generate` / `db:migrate` 脚本已就位，但 `scripts/seed.ts`、`scripts/reset-db.ts`、`drizzle.config.ts`、`src/server/db/*` 由 WP1 提供，因此这些脚本在当前提交下还不可运行。
- 页面只有占位标题，没有任何业务数据与交互；资料列表、方法论库、练习页等由后续工作包实现。
- E2E 用例集为空（WP10 负责）；`playwright.config.ts` 只提供基座，尚未执行过 `playwright install`。
- 界面字体使用系统中文字体栈，未引入 Web 字体。

### 对公共契约的改动

无。WP0 未新增或修改 `data-model.md` 的 schemas、表结构与 `api-and-ui.md` 的接口。

与 `work-packages.md` 的字面差异（均不涉及公共契约，说明如下）：

- **`src/app/layout.tsx` 的 props 类型**：使用显式 `{ children: ReactNode }` 而不是 Next 16 生成的 `LayoutProps<"/">` 全局类型。后者依赖 `.next/types/routes.d.ts`，在未跑过 `next dev`/`next build` 的干净检出上 `pnpm typecheck` 会直接失败。
- **`e2e` script**：写成 `playwright test --pass-with-no-tests`，让 WP0 阶段（还没有 E2E 用例）的 `pnpm e2e` 不报错；WP10 补上用例后该参数无副作用。
- **字体**：跳过脚手架默认的 `next/font/google`（Geist），改为 `--app-font-sans` 系统字体栈，避免构建期访问 Google Fonts，并改善中文渲染。
- **新增依赖**：`@types/better-sqlite3`（better-sqlite3 不自带类型）。`shadcn` 与 `radix-ui` 由 shadcn CLI 自动加入 `dependencies`（`src/app/globals.css` 引用了 `shadcn/tailwind.css`）。

## WP1 · 领域模型、数据库、种子数据

### 完成内容

1. **`src/domain/schemas.ts`**：按 `data-model.md` §2 实现全部 Zod 模型与类型（`ExcerptMatch`、`SourceExcerpt`、`Item`、`KeyPoint`、`Step`、`Principle`、`Concept`、`MethodologyBody`、`MethodologySnapshot`、`Difficulty`、`PracticeMode`、`SelectionMode`、`Scope`、`PlannedResistance`、`CounterpartBrief`、`Alternative`、`Evidence`、`KeyPointVerdictValue`、`PrincipleVerdictValue`、`Recognition`、`Outcome`、`ModelRewrite`、`EndReason`）。额外补了三个后续 WP 需要、而 §2 只在别处隐含的类型：`CounterpartEnd`（对方消息 `end`）、`MessageMeta`（对方消息 `meta`）、`ScoreBreakdown`（`debriefs.scoreBreakdown`）、`DebriefSummary`（`debriefs.summary`）。
2. **`src/domain/constants.ts`**：按 `README.md` §6 实现全部常量（`MAX_TURNS_DEFAULT`、`CHUNK_*`、`EXTRACT_CONCURRENCY`、`QUALITY_RANGE`、`PRINCIPLE_PENALTY(_CAP)`、`ORDER_PENALTY`、`MASTERY_*`、`SELECTION_EPSILON`、`MATCH_MIN_CHARS`、`FUZZY_THRESHOLD`、`LLM_*`）。纯常量与类型，无 IO。
3. **`src/server/db/schema.ts`**：按 `data-model.md` §3 实现全部 14 张表及其列、外键（含 `onDelete` 策略）、`unique(sourceId, seq)`、`unique(sessionId, seq)`、`tags.name` 唯一、`methodology_tags` 复合主键、`debriefs.sessionId` 唯一；JSON 列用 `text({ mode: 'json' }).$type<T>()`。同时导出各表的 `$inferSelect` 行类型与状态联合类型。
4. **`src/server/db/client.ts`**：导出单例 `db`（`resolveDbPath()` = `${AXIOM_DATA_DIR}/axiom.db`，默认 `./data/axiom.db`）；`createDatabase(path?)` 启动时自动建目录、开启 WAL 与外键、自动执行 `drizzle-orm/better-sqlite3/migrator` 迁移；`closeDatabase()` 供脚本收尾。`createDatabase(':memory:')` 供测试基座使用。
5. **迁移**：`drizzle.config.ts`（dialect sqlite、schema、out `src/server/db/migrations`）+ `pnpm db:generate` 生成首个迁移 `src/server/db/migrations/0000_fearless_pandemic.sql`（含 `meta/`）。
6. **`src/domain/methodology-validate.ts`**：`validateMethodologyForConfirm({ name, body })` 返回 `{ path, message }[]` 中文问题列表；覆盖「名称非空、≥1 条适用条件、≥1 个非条件步骤、每步 ≥1 个要点、条件步骤必须有 trigger」五条规则，另加「`inferred=true` 的节点不得带原文摘录」的一致性检查。
7. **测试基座**：`tests/helpers/db.ts`（`createTestDb()` 返回迁移完成的内存库）、`tests/helpers/llm.ts`（`withFakeLLM()` 设置 `AXIOM_FAKE_LLM=1` 并返回还原函数）、`tests/fixtures/methodology.ts`（骨架构造器）。
8. **`scripts/seed-data.ts` + `scripts/seed.ts`**：写入 4 个已确认方法论（向领导提加薪〔职场，严格顺序，含"对方以预算为由拒绝"条件步骤 + "锚定效应"概念〕、结论先行的工作汇报〔职场，含"金字塔原理"概念〕、先共情再建议的安慰法〔亲密关系，严格顺序，含"想听建议"条件步骤 + "情绪验证"概念〕、拒绝额外工作请求〔职场，含"对方施压"条件步骤 + "边界"概念〕）+ 1 个候选方法论（与同事澄清协作分歧，供 WP5 开发审阅界面）。全部 `createdBy='seed'`、`sourceId=null`、`version=1`，标签按名称去重复用（`职场` / `亲密关系`）。脚本幂等（重新运行会先删除旧的 `createdBy='seed'` 方法论）。
9. **`scripts/reset-db.ts`**：删除数据库文件（含 `-wal`/`-shm`）后重新迁移。
10. **测试**：`tests/domain/methodology-validate.test.ts`（每条规则通过与失败、多条问题与字段路径）、`tests/domain/seed-data.test.ts`（5 个/4+1、`MethodologyBody` 校验、确认校验、标签、条件步骤与 trigger、严格顺序与概念、节点 ID 唯一、概念关联步骤存在）、`tests/server/db.test.ts`（内存库读写 JSON 列、外键、级联删除、约束）。

注：WP0 已完成 `git init` 与首次提交，WP1 无需再初始化仓库。

### 验证方式

```
pnpm db:reset && pnpm db:seed   # 成功；重复运行 db:seed 仍为 5 个方法论（幂等）
pnpm db:generate                # 已生成首个迁移，无新增差异
pnpm db:migrate                 # 对已迁移的库为 no-op，成功
pnpm lint && pnpm typecheck     # 通过
pnpm test                       # 4 个文件 / 33 个用例通过
pnpm build                      # 通过，7 个页面预渲染成功
```

数据库内容抽查（`data/axiom.db`）：`methodologies` = 4 confirmed + 1 draft，`tags` = 职场/亲密关系，`methodology_tags` = 5 条，`journal_mode = wal`。

### 已知限制

- 种子方法论没有资料原文，因此所有节点都是 `excerpt=null` + `inferred=true`（不使用假摘录）；这让 WP5 的编辑页在种子数据上看不到"原文已核对"徽章，需要真实抽取（WP4）后才能看到。
- `settings` / `jobs` / `scenarios` / `practice_sessions` / `verdicts` / `llm_calls` 等表已建好但尚无读写代码，由后续 WP 落地。
- `db:seed` 的幂等策略是"删除所有 `createdBy='seed'` 再重写"，尚未被引用的种子方法论每次会换新 ID；后续 WP 若引用了种子方法论，需改用固定 ID。
- 迁移目录路径（`src/server/db/migrations`）由本 WP 选定，`data-model.md` / `README.md` 未指定；后续新增迁移须沿用同一路径。

### 对公共契约的改动

无实质改动。`data-model.md` §2 的模型与 §3 的表结构均按原文实现，未增删字段或改语义。以下为原文未明确、由本 WP 补齐的实现细节（不改变契约语义）：

- 新增补充类型 `CounterpartEnd` / `MessageMeta` / `ScoreBreakdown` / `DebriefSummary`，为 `data-model.md` 中已描述但其 JSON 结构未写成 Zod 的字段（`messages.meta`、`debriefs.scoreBreakdown`、`debriefs.summary`）提供类型。
- `methodologies.version` 默认值 1、`practice_sessions.hintUsed` 默认 false、`verdicts.evidenceDowngraded` 默认 false，按表定义落为 SQL 默认值。
- 迁移目录定为 `src/server/db/migrations`（对应 `README.md` 目录结构中的 `db/migrations`）。
