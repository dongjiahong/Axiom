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
