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

## WP2 · AI 层与设置页

### 完成内容

1. **`src/server/llm/errors.ts`**：`LLMNotConfiguredError`、`LLMOutputError`（带 `task` 与 `errors`）、`LLMUnavailableError`（带 `status`、已去除 Key 的 `detail`）、`LLMTruncatedError`（带已收到的 `text` 与 token 数）。
2. **`src/server/llm/json.ts`**：`extractJson(text)` 返回 `{ ok, value } | { ok: false, error }`。流程：去 `<think>`/`<thinking>` 块（兼容只剩结尾标签的输出）→ 取第一个代码块 → 从第一个 `{` 起做字符串感知的括号配对 → `JSON.parse` → `jsonrepair` 兜底（未闭合的输出也交给它补全）。
3. **`src/server/llm/settings.ts`**：读写 `settings.llm` / `settings.practice`；`AXIOM_LLM_BASE_URL / API_KEY / MODEL` 逐字段覆盖数据库值（空白字符串视为未设置）；`getLLMSettings()` 缺任一字段抛 `LLMNotConfiguredError`；`isLLMConfigured()`（Fake 模式视为已配置）；`maskApiKey()`（`sk-****abcd`）；保存时仅当 Base URL / 模型 / Key 有变化才清空能力探测结果。
4. **`src/server/llm/client.ts`**：`OpenAICompatClient`，按 §2 发送 `temperature` / `response_format`，不发 `max_tokens`；`finish_reason=length` 抛 `LLMTruncatedError`；SDK 错误转为带中文提示的 `LLMUnavailableError`（401/403、404、429、超时、连接失败），信息中的 API Key 会被替换为 `****`；`signal` 已中止时原样抛出中止错误。
5. **`src/server/llm/run-task.ts`**：`TaskDef`、`TaskName`、`runTask`。每次尝试写一条 `llm_calls`（`ok` / `invalid_output` / `transport_error`）；非法 JSON、schema 不符、语义校验失败、截断都带修正提示重试，最多 `LLM_JSON_ATTEMPTS` 次，之后抛 `LLMOutputError`；传输错误不重试；每次尝试前检查 `signal`，并透传给客户端；Fake 模式直接用 `def.fake()`，并断言其输出通过 schema 与 validate（不写 llm_calls）。
6. **`src/server/llm/call-log.ts`**、**`fake.ts`**：`recordLLMCall`（请求/响应文本超过 `LLM_LOG_MAX_CHARS` 截断）；`isFakeLLM()`。
7. **`src/server/prompts/common.ts`**：`outputFormatPrompt`、`correctionPrompt`、`zodErrorToMessages`（如 `keyPointVerdicts[3].quality：不能大于 5`）。
8. **`src/server/http.ts`**：`ApiError`、`errorResponse`（AI 错误映射为 409 `llm_not_configured` / 502 `llm_invalid_output` / 502 `llm_unavailable`，未知错误 500 且不泄露细节）、`parseJson`、`route` 包装。
9. **设置**：`src/server/dto/settings.ts`（API Key 只以掩码下发）、`src/server/services/settings.ts`（`getSettings` / `updateLLMSettings` / `updatePracticeSettings` / `testLLMConnection`）、路由 `GET /api/settings`、`PUT /api/settings/llm`、`POST /api/settings/llm/test`、`PUT /api/settings/practice`。测试连接按 §2 探测 temperature 与 JSON 模式，写回 `settings.llm`，并写入 `task='test'` 的 llm_calls。
10. **设置页 `/settings`**（`components/common/settings-form.tsx`）：Base URL、API Key（密码框，显示掩码，留空不修改）、模型名、保存、测试连接（延迟、JSON 模式、temperature、示例回复）、轮数上限、数据目录与明文存 Key 的提示；被环境变量覆盖时显示提示。
11. **首页横幅**：未配置 AI（且非 Fake 模式）时首页顶部显示引导去设置页的横幅。
12. **测试**（`tests/server/`）：`json`（纯 JSON、代码块、前后文字、`<think>`、尾逗号/未闭合、完全非法）；`run-task`（非法 JSON → schema 不符 → 正确，断言第 2、3 次 messages 含修正提示、3 条 llm_calls；三次失败抛 `LLMOutputError`；语义校验重试；截断；传输错误不重试；signal 透传；未配置；Fake 模式）；`settings`（环境变量覆盖、GET 响应不含 Key、Key 留空不修改、探测结果清空、测试连接各分支、入参范围）；`client`（用注入的 `fetch` 断言请求体、错误转换与 Key 脱敏）；`http-common`（Zod 中文化、修正提示、错误映射）。

### 验证方式

```
pnpm lint         # 通过
pnpm typecheck    # 通过
pnpm test         # 9 个文件 / 87 个用例通过
pnpm build        # 通过，/api/settings* 与 /、/settings 均为动态路由
```

另用本地 mock 的 OpenAI 兼容端点 + `next dev` 手工走通：未配置时 `POST /llm/test` 返回 409；入参非法返回 400 中文提示；保存后 GET 只显示 `****3456`；测试连接在端点拒绝 `temperature` 时自动降级并记录 `supportsTemperature=false`、`supportsJsonMode=true`；首页横幅在配置前出现、配置后消失；dev 日志中不含 API Key。

### 已知限制

- **未用真实的 OpenAI 兼容端点验证**（验收条款里的“真实端点测试连接成功”）：本环境没有可用的 Key，只用了 mock 端点和注入 `fetch` 的单测。请在配置真实端点后点一次“测试连接”确认。
- 设置页的“测试连接”会先保存表单再测试（接口读取的是已保存的设置）。
- Fake 模式下“测试连接”直接返回成功的示例结果，不访问网络，也不写回探测结果。
- 探测 JSON 模式时只有 HTTP 400 记为“不支持”；其他状态码（如某些端点返回 422）会作为连接失败抛出。
- 各任务（`extract_chunk` 等）的 `TaskDef` 与提示词由后续工作包实现；本包只提供 `runTask` 框架，测试里用的是测试专用的 `TaskDef`。
- 客户端网络错误的单测会等待 SDK 的退避重试（约 3 秒）。

### 对公共契约的改动

均为向后兼容的补充，已同步 `docs/plan/*`：

- `LLMClient` 增加可选属性 `model?: string`，仅用于 llm_calls 的 `model` 列（省略时记为 `unknown`）。
- `runTask` 的 `ctx` 增加可选的 `db`、`client`，仅供测试注入；生产代码不传。
- `src/domain/constants.ts` 新增 `LLM_LOG_MAX_CHARS`（200000）、`MAX_TURNS_MIN`（4）、`MAX_TURNS_MAX`（30），并写入 `README.md` §6。
- 新增 `src/server/llm/fake.ts`（`isFakeLLM`）与 `src/server/llm/call-log.ts`，位置与 `README.md` §4 的目录结构一致或为其补充。

## WP3 · 资料导入与解析

### 完成内容

1. **`src/server/parsing/`**（无 DB 依赖，可单测）：
   - `errors.ts`：`ParseError`（message 为可直接展示的中文）。
   - `detect.ts`：`detectFormat`（按扩展名）、`fallbackTitle`、`assertFormatMatchesContent`（epub=`PK\x03\x04`、pdf=`%PDF`；txt/md 不校验），以及统一的 `ParsedSource` / `ParsedSection` 类型。
   - `text.ts`：编码检测（chardet；GB18030/GBK/Big5 用 iconv-lite 转 UTF-8，失败按 UTF-8）、`decodeUtf8Strict`、标题正则（中文「第X章/节…」、英文 Chapter/Part、数字编号），`splitByTitles` / `toSections` / `parseTxt`。
   - `markdown.ts`：依次尝试 `#`/`##`/`###`，选第一个能切出 3–200 节的级别，都不满足退回 `#`；去掉行内与块级 Markdown 标记。
   - `chunk.ts`：`buildChunks`（去空节 → 跳过「目录/版权/致谢…」→ 合并 <1500 字的过短节（标题用 `A / B` 连接，末尾过短节并入前一节）→ 按段落切分 >20000 字的过长节（标题 `原标题（i/n）`）→ 重新编号）与 `splitByMaxChars`。
   - `epub.ts`：jszip + fast-xml-parser + cheerio。container.xml → OPF → manifest/spine；目录优先 EPUB3 `nav[epub:type=toc]`，其次 EPUB2 `toc.ncx`，只取顶层与第二层；按 spine 顺序取正文（删 script/style/nav，块级标签换行）；目录条目（含锚点）为节起点；无目录时每个 spine 文件一节，标题取首个 h1–h3，都没有则「第 N 部分」。
   - `pdf.ts`：unpdf `getDocumentProxy` + `extractText({ mergePages: false })`；平均每页有效字符 <50 判定扫描版（中文报错）；`getOutline`+`getDestination`+`getPageIndex` 映射顶层书签为节边界；无书签用标题正则，仍无则整本一节；删除 ≥50% 页面首/末行重复的页眉页脚；合并被换行打断的句子。
   - `index.ts`：`parseSource(format, buffer, filename)` 按格式分发。
2. **`scripts/make-fixtures.ts`**（`pnpm tsx scripts/make-fixtures.ts`）：生成 6 个夹具并提交到 `tests/fixtures/`——`sample.epub`（epub3 + nav 三级目录，3 章中文，第二章含锚点子节）、`sample-no-toc.epub`、`sample-gbk.txt`（GBK 编码，3 个「第X章」标题）、`sample.md`（多级标题）、`sample.pdf`（pdf-lib 生成，3 章 + 书签）、`sample-no-bookmark.pdf`。夹具已提交，测试不依赖脚本运行。
3. **`src/server/services/sources.ts`**：`resolveUploadsDir`（`${AXIOM_DATA_DIR}/uploads`）、`uploadSource`（校验扩展名/大小/魔数 → 解析 → 分块 → 保存到 `data/uploads/<id>.<ext>` → 同一事务写 `sources`+`source_chunks`；解析失败不落库）、`listSources`（含章节块数与方法论计数，聚合查询）、`getSourceDetail`（章节块摘要 + 当前 job + 预估 token）、`getChunkText`、`setChunkSkipped`（仅 pending↔skipped）、`deleteSource`（删 draft、删资料/章节块/上传文件，confirmed/archived 保留且 `sourceId` 置空）。
4. **`src/server/dto/source.ts`**：`SourceListItemDto` / `SourceDetailDto` / `SourceChunkSummaryDto` / `SourceJobDto` / `SourceChunkTextDto`；详情不含章节块正文，正文单独接口下发。
5. **接口**：`POST/GET /api/sources`、`GET/DELETE /api/sources/[id]`、`GET/PATCH /api/sources/[id]/chunks/[chunkId]`。
6. **页面**：`/sources`（拖拽/点击上传 + 资料卡片列表 + 删除）与 `/sources/[id]`（头部信息 + 章节块表格 + 正文侧栏 Sheet + 跳过开关；「开始抽取/取消/重试失败章节」按钮禁用，待 WP4 接入）。组件 `src/components/sources/{sources-list,chunk-table,labels}.tsx`。
7. **测试**：`tests/server/parsing/*`（detect/text/markdown/chunk/epub/pdf/夹具统一解析）与 `tests/server/sources.test.ts`（上传各夹具、GBK 不乱码、魔数与扩展名不符、空文件、超限、解析失败不落库、计数、跳过切换、删除规则）。

### 验证方式

```
pnpm lint && pnpm typecheck   # 通过
pnpm test                     # 17 个文件 / 144 个用例通过（新增 7 个文件 / 60 个用例）
pnpm build                    # 通过；/sources 与 /sources/[id] 为动态路由
pnpm tsx scripts/make-fixtures.ts   # 可重复生成 tests/fixtures/ 下的 6 个夹具
```

另用 `pnpm start`（独立 `AXIOM_DATA_DIR`）手工走通：上传 epub / GBK txt / pdf 均返回 `ready` 与合理章节块；打开详情页（200）与正文接口；切换跳过；扩展名不符返回 400 中文错误；删除返回 `{deleted:true}`。

### 已知限制

- **夹具章节都很短（<1500 字）**，分块阶段会合并为一节，所以页面上的「章节列表」每个夹具只有 1 行；这是分块规则（合并过短节）的预期行为，真实书籍章节足够长时不会合并。分节本身在解析层单测（`epub.test.ts` 等）中按节验证。
- **未用真实书籍（epub/txt）做人工验收**：验收条款「上传以上各类文件都能看到合理的章节列表」用的是自建夹具，规模远小于真实书籍；建议再用一本真实中文 epub 走一遍。
- **PDF 换行合并的语言启发式**：`algorithms.md` §1.3.5 只描述「合并被换行打断的中文句子」，实现中若前一行以 ASCII 字符结尾、下一行以 ASCII 字母数字开头则补一个空格（避免英文 PDF 出现 `understood.Repeat`）；中文仍按原文直接拼接。
- `sources.status` 目前只会是 `ready`；`parsing`/`extracting`/`extracted`/`failed` 由 WP4 的抽取任务写入。`jobs` 表已建但无写入方，详情页的 `job` 恒为 `null`。
- 上传为同步解析，超大 epub/pdf 会占用请求线程数秒（`api-and-ui.md` 说明可接受）。
- 构建时 Next 会对 `writeFileSync(动态路径)` 给出 “filesystem access causes the whole project to be traced” 警告（非错误）；路径必须动态（`AXIOM_DATA_DIR`），未做抑制。
- `db:seed` 生成的种子方法论与本次改动无交互；夹具文件已提交（约 3KB 级）。

### 对公共契约的改动

无 schema / 表结构 / 接口的既有契约改动。新增的接口与 DTO 均落在 `api-and-ui.md` §3 已列出的路径与形态之内（未实现其中的 `extract` 与 `jobs` 部分，属 WP4 范围）。以下为原文未明确、由本包补齐的实现细节：

- `src/domain/constants.ts` 新增 `UPLOAD_MAX_BYTES`、`PDF_MIN_CHARS_PER_PAGE`、`PDF_HEADER_FOOTER_PAGE_RATIO`、`TOKEN_ESTIMATE_PER_CHAR`、`TEXT_TITLE_MAX_CHARS`、`TEXT_NUMBERED_TITLE_MIN_COUNT/MAX_COUNT`、`MD_SECTION_MIN_COUNT/MAX_COUNT`，并写入 `README.md` §6。
- 上传文件路径定为 `${AXIOM_DATA_DIR}/uploads/<id>.<format>`（与 `data-model.md` 的 `data/uploads/<id>.<ext>` 一致）。
- 新增依赖 `pdf-lib`（devDependency，仅 `scripts/make-fixtures.ts` 用于生成 PDF 夹具；运行时不使用）。

## WP4 · 抽取流水线

### 完成内容

1. **`src/domain/text-match.ts`**：`normalizeWithMap`（逐字符 NFKC + 小写 + 去空白/标点/符号，同时产出「归一化下标 → 原文下标」映射）、`normalize`、`findText`、`matchExcerpt`（`algorithms.md` §2–3：精确 → 模糊 → 无；多个 haystack 时返回命中的 `chunkId`，精确命中优先于其他块的模糊命中，模糊命中取比例最高的块；还原出的片段超过摘录归一化长度 2 倍时截断）。
2. **TaskDef**（`src/server/prompts/`）：`extract-chunk.ts`（导出 `AiMethodology`、`ExtractChunkOutput`、共用的 `validateAiMethodology` 与 `AI_METHODOLOGY_DESCRIPTION`）、`cluster.ts`、`merge.ts`，均含提示词、schema、`validate`、`fake`，`promptVersion` 分别为 `extract_chunk@1` / `cluster@1` / `merge@1`。
3. **AI 输出 → 领域模型**（`src/server/extraction/`）：`mapping.ts`（`aiToBody` 分配 nanoid、核对摘录、`relatedStepIndexes` → `relatedStepIds`；`bodyToAi` 供合并任务；`normalizeTagNames`）、`cluster.ts`（>150 条按 150/重叠 20 分批、跨批有交集的组取并集）、`drafts.ts`（写入 draft 与按名称建标签）、`suggestions.ts`（写入合并建议，成员相同的建议不重复创建）。
4. **任务队列**（`src/server/jobs/`）：`runner.ts`（`JobRunner`：同一时间 1 个 job、状态落 `jobs` 表、取消、`recover()`、`whenIdle()`；单例挂在 `globalThis`）、`extract-source.ts`（`extract_source` 处理器：章节抽取按 `EXTRACT_CONCURRENCY` 并发 → 聚类 → high 组自动合并 / medium 组写合并建议）、`errors.ts`（异常 → 中文说明）。`src/instrumentation.ts` 在 Node 运行时启动时调用 `recover()`。
5. **`services/extraction.ts`**：`startExtraction`、`retryFailedChunks`、`getJob`、`cancelJob`、`listSourceDrafts`、`listMergeSuggestions`；DTO 在 `dto/job.ts`、`dto/extraction.ts`。
6. **接口**：`POST /api/sources/[id]/extract`、`GET /api/jobs/[id]`、`POST /api/jobs/[id]/cancel`。
7. **资料详情页**：`ExtractionPanel`（开始抽取确认框含待抽取块数与预估 token、按 2 秒轮询的进度条与阶段文字、取消、重试失败章节）、候选方法论列表、合并建议列表（接受/忽略按钮按计划隐藏，等 WP5）。
8. **测试**：`tests/domain/text-match.test.ts`；`tests/server/extraction-units.test.ts`（各任务 fake 通过 schema+validate、语义校验、映射、聚类分批/并集）；`tests/server/extraction.test.ts`（Fake LLM 集成：摘录全为 exact、幂等、不删已确认方法论、同名自动合并并归档、medium 生成合并建议且不重复、自动合并失败降级为建议、失败块与重试、处理中取消并可继续、排队中取消、重启恢复）；`tests/server/extraction-fixtures.test.ts`（导入 4 个夹具后抽取）。

### 验证方式

```
pnpm lint && pnpm typecheck   # 通过
pnpm test                     # 21 个文件 / 188 个用例通过（新增 4 个文件 / 44 个用例）
pnpm build                    # 通过
```

另用 `AXIOM_FAKE_LLM=1 next start`（独立 `AXIOM_DATA_DIR`）手工走通：上传 → `POST /extract` → 轮询 `GET /api/jobs/[id]` 至 `succeeded`；详情页返回 200；已结束的任务取消返回 409 中文错误；手工把 job 置为 `running` 后重启服务，`register()` 恢复并跑完该 job。

### 已知限制

- **未用真实模型和真实书籍验收**：WP4 验收条款「用真实模型导入一本中文沟通类书（epub），页面看到进度并产出候选方法论」尚未做；提示词效果（摘录逐字性、条件步骤划分、聚类质量）只在 Fake 模式和桩任务下验证。需要你配置模型后跑一本真实的书。
- 合并建议的「接受/忽略」按钮未接入（WP5 的接口未完成，按计划隐藏）；候选方法论条目也暂无跳转链接。
- 聚类失败（`cluster` 任务多次输出不合规或端点不可用）会使整个 job 为 `failed`，此时各章节的 draft 已保留、资料状态为「已抽取」，需再次点击「开始抽取」才会重新去重（此时没有待抽取块，只会重跑去重阶段）。单个高置信组的合并失败不会让 job 失败，而是降级为一条合并建议（原因中注明「自动合并失败」）。
- 重新聚类时参与的 draft 包括本资料所有 `createdBy in (extraction, merge)` 且仍是 draft 的方法论，用户手工编辑过的 draft 也可能被自动合并；`algorithms.md` 对此未细说，待 WP5 有编辑功能后再评估是否需要排除。
- AI 未给出摘录、又未标 `inferred` 的节点，映射时按「推断内容」处理（`inferred=true`，`excerpt=null`），而不是留成既无摘录也无推断标记的节点。
- 失败章节块的 `extractionError` 只存经 `describeJobError` 处理的中文说明，原始异常只写服务端日志。
- `JobRunner.cancel` 不抛 `ApiError`，任务不存在或已结束的判断放在 `services/extraction.ts`：单例在 `instrumentation` 里创建，生产构建下它与路由不是同一份模块图，`instanceof ApiError` 会失败（手工验证时发现）。
- 删除资料时不检查是否有进行中的抽取任务（WP3 的 `deleteSource` 未改）；此时该 job 的后续写入会失败（未专门验证过具体表现）。

### 对公共契约的改动

无 schema / 表结构 / 既有接口的改动。补充内容：

- `src/domain/constants.ts` 与 `README.md` §6 新增 `FUZZY_SEGMENT_LENGTH`（8）、`FUZZY_SEGMENT_STEP`（4）、`CLUSTER_BATCH_SIZE`（150）、`CLUSTER_BATCH_OVERLAP`（20）。
- `extract_source` 处理器的三个 AI 调用经 `ExtractTasks`（`extractChunk` / `cluster` / `merge`）注入，默认走 `runTask`，测试可替换为桩。
- `POST /api/sources/[id]/extract` 与 `GET /api/jobs/[id]` 返回 `JobDto`：`{ id, sourceId, status, stage, progressDone, progressTotal, error }`（比 `api-and-ui.md` 列出的字段多 `id`、`sourceId`）。`POST /extract` 在资料没有可抽取的章节块（全部已跳过）时返回 400，未配置模型且非 Fake 模式时返回 409（`llm_not_configured`）。
- 「重试失败章节」与「开始抽取」共用 `POST /extract`（处理器本来就处理 pending 与 failed 两类块）。

## WP5 · 方法论库与审阅

### 完成内容

1. **服务层**
   - `services/methodologies.ts`：`listMethodologies`（按 `status / tagId / sourceId / q` 筛选）、`getMethodology`、`createBlankMethodology`（手动新建 draft，带 1 个空步骤 + 1 个空要点）、`saveMethodology`、`changeMethodologyStatus`（confirm / unconfirm / archive / restore）、`splitMethodology`、`mergeMethodologies`、`acceptMergeSuggestion`、`dismissMergeSuggestion`。
   - `services/tags.ts`：`listTags`（含未归档方法论的使用数量）、`setMethodologyTags`（整体替换，不存在的标签自动创建）。
   - `extraction/merge-drafts.ts`：`mergeDrafts`，把一组 draft 合并为新 draft（摘录在来源章节块并集中重新核对，标签与 `originChunkIds` 取并集，原 draft 归档并写 `mergedIntoId`）。**抽取流水线的高置信自动合并（`extract-source.ts`）改为调用它**，与手动合并、接受建议共用一份逻辑。合并期间成员被改动（不再是 draft 或 `updatedAt` 变化）时放弃合并并返回 409。
   - `dto/methodology.ts`：列表项 / 详情 DTO（详情含 `originChunks`：`{ id, sourceId, title }`，供原文抽屉取正文）与保存、拆分、合并的入参 schema。
2. **规则**
   - 状态迁移：draft→confirmed（confirm）、confirmed→draft（unconfirm）、draft/confirmed→archived（archive）、archived→draft（restore），其他一律 409。
   - 确认校验 `collectConfirmIssues`：`validateMethodologyForConfirm` 的业务规则 + `MethodologyBody` 严格校验（步骤标题、要点文本不能为空等），同一路径只报一次；失败返回 400，全部问题在 `error.issues`。
   - 保存：宽松入参（节点 id 可省略、文本可为空）；新节点及重复 id 由服务端补 nanoid，已存在 id 不变；概念的 `relatedStepIds` 只保留仍存在的步骤；confirmed 保存前必须通过确认校验，保存后 `version + 1`；archived 保存返回 409。
   - 拆分：只允许 draft；新 draft 名称加“（拆分）”，复制适用条件、反例、原则、概念、标签、`sourceId`、`originChunkIds`，所有节点换新 id，概念的关联步骤随之映射；原方法论移除所选步骤并清理概念关联；拆完原方法论没有非条件步骤则 400。
   - 撤销合并：restore 一个因合并而归档的原 draft 时，只恢复被点的这个，清空 `mergedIntoId`；合并结果仍是 draft 才归档，已确认的不动；其他原 draft 保持归档。
   - 合并建议：accept 要求建议为 open 且成员全部仍是 draft，否则 409（含成员已被删除）；成功后标记 `accepted`。dismiss 标记 `dismissed`。
3. **接口**：`GET/POST /api/methodologies`、`GET/PUT /api/methodologies/[id]`、`POST /api/methodologies/[id]/{confirm,unconfirm,archive,restore,split}`、`POST /api/methodologies/merge`、`GET /api/merge-suggestions`（`?sourceId&status`）、`POST /api/merge-suggestions/[id]/{accept,dismiss}`、`GET /api/tags`。
4. **页面**
   - `/library`：候选 / 已确认 / 已归档三个页签（带数量，默认“已确认”），按标签、资料、名称筛选（URL 参数驱动），列表项显示标签、来源、步骤数、“N 处 AI 推断”“N 处摘录未匹配”；候选页签可多选合并；选中 2 个可跳到对比页；空状态引导去导入资料。
   - `/library/[id]`：react-hook-form + useFieldArray 编辑器——名称、可新建标签、概要 / 目标、适用条件、反例、顺序模式、步骤（上移 / 下移、条件步骤 + 触发条件、要点、示例话术、常见错误）、原则、概念（关联步骤多选）；节点旁的核对徽章（原文已核对 / 近似匹配 / 未在原文中找到 / AI 推断），点击打开右侧原文抽屉并高亮、滚动到摘录位置；拆分模式（步骤复选框）；确认失败时在顶部列出全部问题，点击定位到字段；有未保存修改时刷新 / 关闭页面或点击站内链接会提示；归档状态只读。
   - `/library/compare?a=&b=`：两列并排对比。
   - 资料详情页：候选方法论名称链接到编辑页；合并建议增加“接受合并 / 忽略”按钮（`components/sources/merge-suggestion-list.tsx`）。
5. **测试**：`tests/server/methodologies.test.ts`（36 个用例）覆盖：合法与非法状态迁移（409）、确认失败 400 且列出全部问题、confirmed 保存 version+1 / draft 不变、新节点补 id 且已有 id 不变、重复 id 重新分配、标签自动创建与替换、空白骨架可保存但不能确认、confirmed 保存校验失败不改动、archived 保存 409、拆分（划分、概念映射、拒绝留不下非条件步骤、非 draft）、合并（归档与 `mergedIntoId`、restore 撤销、已确认合并结果不被归档、摘录在块并集中重新核对、跨资料 `sourceId` 为空、参数 / 状态校验、合并期间被改动 409、AI 失败不改动）、合并建议（接受 / 忽略 / 过期 / 重复处理）、列表筛选与标签计数。删除资料时 draft 删除、confirmed 保留且 `sourceId` 置空的用例已由 WP3 的 `tests/server/sources.test.ts` 覆盖。

### 验证方式

```
pnpm lint         # 通过，无告警
pnpm typecheck    # 通过
pnpm test         # 22 个文件 / 224 个用例通过（新增 1 个文件 / 36 个用例）
pnpm build        # 通过
```

另用 `AXIOM_FAKE_LLM=1` + 独立 `AXIOM_DATA_DIR` 启动 `next start`，先 `db:seed`，手工走通：
- API：列表 / 详情 / 标签；确认种子 draft；对空白 draft 确认返回 400 与 `issues`；非法迁移返回 409；手动合并两个 draft 得到 `createdBy=merge` 的新 draft，原 draft 归档。
- 浏览器（agent-browser）：打开编辑页 → 改名称、添加已有标签、下移步骤 → 保存，version 2、步骤顺序与标签生效，已有节点 id 不变；对空白 draft 点“确认入库”，顶部列出 3 个问题；上传夹具并 Fake 抽取后，点击“原文已核对”徽章，抽屉高亮了对应原文。

### 已知限制

- **未用真实模型验证合并任务的质量**：只在 Fake 模式和桩任务下验证；真实模型下合并结果（是否丢要点、摘录是否原样）需要人工检查。
- 未在浏览器里逐项走通：拆分模式、合并建议的接受 / 忽略按钮、对比页、未保存修改的离开提示（这几处只有服务层测试 / 类型检查 / 构建保证）。
- 示例话术、常见错误在编辑器里是“每行一条”的多行文本框，而不是逐条增删的列表；提交时会去掉空行。
- 标签输入是“输入 + 回车 / 点击已有标签”，不是下拉多选框。
- 版本号只在**保存已确认方法论**时 +1（按计划）。“退回候选 → 修改 → 再次确认”不会自动 +1，这条路径下快照 / 场景记录的 `version` 可能与内容不完全对应；如需严格对应，应在再次确认时也 +1（待你决定）。
- 方法论没有删除接口（计划接口清单中没有），用“归档”代替。
- 确认校验中来自 Zod 的问题文案形如 `steps[0].title：长度不能小于 1`，不如业务规则的文案友好。
- WP4 遗留的“重新聚类时用户手工编辑过的 draft 也可能被自动合并”仍未处理；本包增加的合并期间变化检测只能兜住并发编辑，不能区分“用户是否编辑过”。
- 手动新建、没有标签的 draft 在 Fake 模式合并时，Fake 合并任务会补一个“未分类”建议标签（真实模型不受影响）。

### 对公共契约的改动

均为向后兼容的补充，已同步 `docs/plan/api-and-ui.md`：

- **错误响应**新增可选字段 `error.issues: { path, message }[]`（`ApiError` 新增可选的第 4 个构造参数 `issues`）；目前只有确认入库 / 已确认保存的校验失败会带。
- **`PUT /api/methodologies/[id]`**：入参 body 与 `MethodologyBody` 同形，但节点 `id` 可省略、文本允许为空（原文写“用 `MethodologyBody` 校验”，而空白骨架与编辑中的 draft 无法通过严格校验；经确认改为“保存宽松、确认严格”）。已确认方法论保存前须通过确认校验（经确认）。
- **确认校验**在 `validateMethodologyForConfirm` 之外叠加 `MethodologyBody` 严格校验（`validateMethodologyForConfirm` 本身未改）。
- **撤销合并**的语义按上文明确（经确认）。
- **`MergeSuggestionDto`** 增加 `sourceId`；`listMergeSuggestions(sourceId?, database?, status?)` 的 `sourceId` 改为可选并增加 `status` 参数，原有按资料查询的调用不受影响。
- **WP4 代码的小改动**：`extract-source.ts` 的高置信合并改用共享的 `mergeDrafts`（行为不变，并新增“合并期间成员被改动则放弃”的检查，放弃时仍降级为合并建议）；`insertDraft` 的 `sourceId` 允许为 `null`；导出 `ensureTagIds`（`extraction/drafts.ts`）与 `describeIssue`（`prompts/common.ts`）；`merge` 任务的 `fake()` 在没有任何标签时补“未分类”（`promptVersion` 未变，输出 schema 未变）。
- 新增 `GET /api/tags` 返回 `{ id, name, count }[]`，`count` 为使用该标签且未归档的方法论数量（原文“使用数量”未细化）。

## WP6 · 选题与场景生成

### 完成内容

1. **领域纯函数**
   - `src/domain/mastery.ts`：`computeMastery(methodologyId, records, now)`（`algorithms.md` §7）。执行取该方法论作为所用方法论的最近 5 场、识别取其作为目标方法论的最近 5 场综合测验；查看过提示折算 0.7；两者都没有为 0；衰减 `0.5 + 0.5 × 2^(−d/30)`（刚练过 1，30 天 0.75）。
   - `src/domain/selection.ts`：`resolveScope`（标签 ∪ 资料 ∪ 方法论，全空 = 全部，保持库中顺序）、`pickWeighted`（权重 `1 − mastery + ε`，`rng` 可注入）。
2. **`src/server/prompts/scenario.ts`**：`scenarioTask`（`scenario@1`，温度 0.9）。含提示词、输出 schema、`fake()`，以及全部语义校验：开场白与 `openingSpeaker` 一致；`linkedStepRef` 必须指向条件步骤；阻力数量随难度（1–2 / 2–3 / 3–5）；一般/强硬难度下条件步骤都要被阻力关联；`alternatives` 引用必须在 `others` 中；可见字段（title、background、userRole、userGoal、counterpart.*、openingLine）归一化后不得含目标/其他方法论名称，或长度 ≥4 的目标步骤标题。`buildScenarioInput` 负责生成短引用（步骤 `s1..`，其余方法论 `m1..`）。
3. **`services/scenarios.ts`**：`generateScenario`——`resolveScope` → 校验（drill+pick 须指定已确认方法论；drill+random 范围非空；quiz 范围 ≥2）→ 目标（random 时用 `loadMasteryRecords` 从已复盘练习计算掌握度后加权抽取）→ 组装输入（`others` = 范围内其余已确认方法论，`recentTitles` = 该目标最近 10 个场景标题）→ `runTask` → 阻力分配 `r1..rn`、引用映射回真实 ID → 写入 `scenarios`（quiz 的 `candidateIds` = 范围内全部已确认方法论，drill 为 `[目标]`）。
4. **`services/practice.ts`（创建部分）**：`createPractice`（生成场景 + 新建 briefing 会话，`maxTurns` 取设置值，drill 的 `selectedMethodologyId` = 目标）、`getSession`、`selectMethodology`（quiz，须在候选内，briefing 阶段可多次修改）、`startSession`（写入 `targetSnapshot` / `selectedSnapshot` / `startedAt`；对方先开口时插入 turn 0 的开场白）、`requestHint`（drill，置 `hintUsed`，返回骨架）。
5. **`src/server/dto/session.ts`**：`toSessionDto` 严格按 `data-model.md` §4。复盘前，键本身不出现（而不是 null）：`brief`、`designNotes`、`alternatives`、`meta`、快照；quiz 还不下发 `targetMethodologyId` / `targetMethodologyName`，候选只含 `{ id, name, tags }` 并按名称（中文拼音序）排序。debriefed / debrief_failed 后下发目标、备选（含名称与理由）、设计说明、角色卡、消息 `meta` 与目标方法论骨架（`targetSkeleton`）。`toSkeletonDto` 是提示接口和复盘共用的方法论骨架（不含原文摘录）。
6. **接口**：`POST /api/practice`（返回 `{ sessionId }`）、`GET /api/sessions/[id]`、`POST /api/sessions/[id]/select`、`/start`、`/hint`。
7. **页面**：`/practice/new`（模式 → 选题〔drill 指定/随机、quiz 范围〕→ 难度 → 生成场景，实时显示范围内数量，不足 2 个时禁用；方法论库为空时引导去导入资料）；`/practice/[sessionId]` 的 briefing 状态（场景卡；drill 显示目标方法论名称与“查看方法论骨架”按钮，旁注明查看后会标记；quiz 为候选单选列表；“开始对话”）。active / ended 等状态暂只显示场景卡与“对话功能开发中”（WP7 负责）。
8. **测试**
   - `tests/domain/mastery.test.ts`、`selection.test.ts`：从未练习 = 0；执行与识别加权且各归其属；查看提示折算；最近 5 场；时间衰减（0 天 1、30 天 0.75、极久趋近 0.5）；固定 rng 抽取、并集、全空 = 全部。
   - `tests/server/scenario-task.test.ts`：44 个用例，含 fake 在 drill/quiz × 三档难度 × 0/1/2/6 个条件步骤下都通过 schema 与语义校验；每个可见字段的泄露检查；阻力数量、`linkedStepRef`、条件步骤关联、备选引用。
   - `tests/server/practice.test.ts`：24 个用例（内存库 + Fake LLM）——创建（drill/quiz、掌握度加权、recentTitles、各种 400 校验且不留脏数据）、select、start（快照正确、开场白 turn 0、409 场景、修改方法论不影响快照）、hint、**DTO 泄露测试**（quiz 在 briefing / active / ended 均无 `targetMethodologyId`、`alternatives`、`designNotes`、`brief` 等键；角色卡与设计说明的任意值不出现在序列化响应中；候选按名称排序且只有 id/name/tags；复盘后才揭晓）。

### 验证方式

```
pnpm lint         # 通过
pnpm typecheck    # 通过
pnpm test         # 26 个文件 / 306 个用例通过（新增 4 个文件 / 82 个用例）
pnpm build        # 通过（在临时拷贝中构建并验证，见下）
```

另在临时拷贝中以 `AXIOM_FAKE_LLM=1` + 独立 `AXIOM_DATA_DIR` + `db:seed` 启动 `next start`，用 curl 与浏览器（agent-browser）走通：
- API：创建 quiz → `GET /api/sessions/[id]` 的候选按名称排序、无隐藏键；未选择就 start 返回 409；quiz 请求 hint 返回 409；范围不足返回 400 中文提示；非法入参返回 400。
- 浏览器：`/practice/new?mode=quiz` 勾选“职场”标签生成综合测验 → briefing 只显示 3 个候选 → 选择并“开始对话”进入 active；专项练习指定“向领导提加薪” → “查看方法论骨架”展示适用条件、步骤（含条件步骤与触发）和原则。

### 已知限制

- **未用真实模型验证场景质量**：提示词效果（场景是否泄露做法、阻力是否真能触发条件步骤、quiz 场景能否区分候选）只在 Fake 模式和桩输出下验证，需要配置真实模型后人工试几场。
- 复盘（WP8）尚未实现，所以“按掌握度加权”所用的已复盘练习在真实数据里暂时为空，此时所有方法论掌握度为 0、等权抽取；逻辑已由集成测试用手工插入的已复盘练习覆盖。
- active / ended / debriefed 状态的练习页暂为占位（WP7 / WP8）。
- 开场白消息的 `seq` 从 1 开始（`unique(sessionId, seq)`）；WP7 追加消息时应取 `max(seq) + 1`。
- 阻力与条件步骤的关联规则：计划原文要求“neutral/tough 时每个条件步骤至少被一条阻力关联”，但当条件步骤数超过该难度允许的阻力上限（例如一般难度只允许 2–3 条、而方法论有 4 个条件步骤）时这条规则无法满足。实现为：要求关联到的不同条件步骤数 ≥ `min(条件步骤数, 阻力条数)`，即条件步骤不多时全部关联，否则每条阻力都关联到不同的条件步骤。
- quiz 的 `selection` 在页面上固定发送 `random`（计划中“指定”的语义 = 用户勾选一组方法论作为范围，与随机在范围内加权抽取一致）；接口层 quiz + pick 与 quiz + random 行为相同。
- drill + pick 时页面把 `scope` 设为 `{ methodologyIds: [所选] }`，因此 `others` 为空，避免专项练习把整个方法论库塞进提示词；接口层若传入更大的 `scope`，`others` 仍按计划取范围内其余已确认方法论。
- 综合测验开始时若所选方法论或目标方法论已被退回候选 / 归档，`start` 返回 409（“所需的方法论已不在方法论库中”），没有自动换题。
- 场景生成失败（AI 输出不合规、未配置模型等）不会留下场景或会话；新建练习页用 toast 展示错误。

### 对公共契约的改动

均为向后兼容的补充：

- `src/domain/constants.ts` 与 `README.md` §6 新增 `RECOGNITION_SCORE`、`RESISTANCE_COUNT_RANGE`、`SCENARIO_RECENT_TITLES`、`SCENARIO_LEAK_MIN_STEP_TITLE_CHARS`、`QUIZ_MIN_SCOPE_SIZE`。`RECOGNITION_SCORE` 供 WP8 的 `recognition.ts` 和 WP9 统计复用。
- `SessionDto`（`src/server/dto/session.ts`）是 `GET /api/sessions/[id]` 的响应形状：`scenario` 只含可见字段；`candidates` 仅 quiz；`targetMethodologyId` / `targetMethodologyName` 在 drill 始终下发、quiz 复盘后才下发；`brief` / `designNotes` / `alternatives` / `targetSkeleton` / 消息 `meta` 只在 debriefed / debrief_failed 下发。WP7 / WP8 需沿用该 DTO 并在其上扩展。
- `POST /api/sessions/[id]/select` 与 `/start` 返回更新后的 `SessionDto`，`/hint` 返回方法论骨架 `MethodologySkeletonDto`；`POST /api/practice` 返回 `{ sessionId }`。
- 服务函数 `requestHint`（避免与 React Hook 命名规则冲突，未使用 `useHint`）。

## WP7 · 练习对话

### 完成内容

1. **`src/server/prompts/counterpart.ts`**：`counterpartTask`（`counterpart@1`，温度 0.8）。输入 `{ scenario（含 brief）, difficulty, history, turn, maxTurns }`，不含目标方法论；`buildCounterpartMessages` 组装消息：唯一的 system 消息在最前（每次重新生成，含角色卡、阻力 id、当前轮次，最后一轮追加收尾提示，末尾重申输出格式）；历史中对方消息为 `assistant`（纯 reply 文本）、用户消息为 `user`；历史以对方开场白开头时前置一条 `user`「（对话开始）」。语义校验：`firedResistanceIds` 必须是已有阻力 id。`fake()` 按 `llm-and-prompts.md` §11 实现。
2. **`services/practice.ts` 对话部分**
   - `sendMessage`：仅 active；上一条是用户消息（上次生成失败）→ 409 提示先重试；已到轮数上限 → 409；插入用户消息（`turn` = 已有用户消息数 + 1，`seq` = 最后一条 `seq` + 1）→ 调对方任务 → 写回复（`meta` 记录 `firedResistanceIds` 与 `end`）→ 结束判定（对方 `end` 非空优先，其次 `turn >= maxTurns` → `turn_limit`）。生成失败时用户消息保留、错误照常抛出（502 / 409）。
   - `regenerateReply`：仅当最后一条是用户消息时可用，与上面后半段共用同一段逻辑。
   - `endSession`：active 才可结束；没有用户消息时删除会话并返回 `{ deleted: true }`，否则 `ended`（`endReason='user'`）。
   - 写回复在事务内重新检查会话仍为 active 且最后一条消息未变，避免“生成期间用户手动结束”或并发重复触发时写入过期回复（409）。
3. **接口**：`POST /api/sessions/[id]/messages`（`{ content }`，去空白后 1–1000 字）、`/regenerate`、`/end`。
4. **页面**：`/practice/[sessionId]` 的 active 状态（`active-view.tsx`）：场景卡可折叠、“第 n / max 轮”、气泡对话（对方左、用户右）、“对方正在输入……”、失败时在最后一条用户消息下显示“生成失败，重试生成回复”并禁用输入、Enter 发送 / Shift+Enter 换行（输入法选词中的回车不发送）、专项练习的方法论骨架抽屉（首次打开才调用 `/hint`）、“结束练习”二次确认（无发言时提示会丢弃并跳回新建练习）。ended 状态（`ended-view.tsx`）：结束原因（“对方：{endNote}” / “已到达轮数上限” / “你结束了练习”）+ 完整对话 + “复盘功能开发中”占位。debriefed / debrief_failed 暂用同一视图，等待 WP8。
5. **测试**：`tests/server/counterpart-task.test.ts`（8 个）：消息组装（唯一 system、阻力 id、末轮提示、开场白前置 user）、语义校验、schema 边界、fake。`tests/server/dialogue.test.ts`（21 个，内存库 + Fake 或桩）：有 / 无开场白的 turn 与 seq、meta 落库但不下发、传给对方任务的历史与轮次、内容校验、对方 `end`（agreed / broke_down / closed）、`turn_limit`、同轮对方宣告结束优先、最后一轮提示进入 messages、已结束 / briefing 状态 409、失败 → 用户消息保留 → 再发 409 → regenerate 恢复、多次失败后重试、重试后触发 `turn_limit`、生成期间被手动结束 → 409 且不写回复、结束时无用户消息 → 会话被删除、有用户消息 → `ended`。

### 验证方式

```
pnpm lint         # 通过
pnpm typecheck    # 通过
pnpm test         # 28 个文件 / 335 个用例通过（新增 2 个文件 / 29 个用例）
pnpm build        # 通过
```

另用 `AXIOM_FAKE_LLM=1` + 临时 `AXIOM_DATA_DIR` + `db:seed` 启动 `next start`，用 curl 走通：创建并开始专项练习 → 空消息 400 → 发消息得到用户消息与对方回复（turn 1，seq 连续）→ 对空闲会话 regenerate 返回 409 → 发“谢谢”后会话 `ended`（`agreed`，带 endNote）→ 再发消息 409 → 练习页返回 200 并渲染结束视图。

### 已知限制

- **未在浏览器里逐项操作 active 页面**（输入 / 发送 / 失败重试 / 结束确认 / 骨架抽屉只有类型检查、构建与接口层验证），需要人工点一遍。
- **未用真实模型验证对方表演质量**（不跳出角色、按计划阻力施压、不轻易让步）：只在 Fake 与桩下验证，验收里“真实模型下人工检查”仍待做。
- 计划中的“ended 后自动触发复盘”依赖 WP8 的接口，本包只显示“复盘功能开发中”，没有调用复盘接口。
- 手动结束一个没有用户发言的会话会删除会话，但其场景记录保留（用于“最近场景标题”去重，也不影响其他数据）。
- briefing 状态调用 `/end` 返回 409（计划只定义了 active 的结束）。
- 内容为空时的 400 文案沿用通用 Zod 中文化（“content：长度不能小于 1”），未使用自定义文案；前端已在空内容时禁用发送按钮。

### 对公共契约的改动

均为向后兼容的补充：

- `src/domain/constants.ts` 与 `README.md` §6 新增 `MESSAGE_MAX_CHARS`（1000）、`COUNTERPART_REPLY_MAX_CHARS`（300）、`COUNTERPART_REPLY_PROMPT_CHARS`（120）。
- `POST /api/sessions/[id]/messages` 与 `/regenerate` 返回 `MessageResultDto`：`{ messages, session: { status, endReason, endNote, turn, maxTurns } }`。`messages` 在 `/messages` 为 `[用户消息, 对方回复]`，在 `/regenerate` 为 `[对方回复]`；相比计划的 `session` 摘要多了 `endNote`（结束视图需要）。消息不含 `meta`。
- `POST /api/sessions/[id]/end` 返回更新后的 `SessionDto`，或 `{ deleted: true }`。
- `src/server/dto/session.ts` 新增 `SendMessageInput`、`MessageResultDto`、`toMessageDto`（`toSessionDto` 改为复用它，行为不变）。
- `services/practice.ts` 新增 `sendMessage`、`regenerateReply`、`endSession` 与测试注入点 `DialogueOptions.counterpart`。
- `briefing-view.tsx` 导出 `Skeleton`（方法论骨架展示），供 active 页面的抽屉复用。

## WP8 · 复盘与改判

### 完成内容

1. **领域纯函数**（`src/domain/`）
   - `evidence.ts`：`checkEvidence`（先在声称的轮次里精确 → 模糊核对，找不到再到其他用户消息里找并修正 `turn`，命中时 `quote` 换成用户真实原话；都找不到 `match='none'`）、`downgradeKeyPoint`（done/partial 无有效证据 → missed、质量分置空）、`downgradePrinciple`（violated 无有效证据 → kept）。
   - `scoring.ts`：`convergeKeyPoint`（§5.1 质量分收敛，含非条件步骤的 not_triggered → missed）、`validateKeyPointOverride`（改判入参校验）、`computeExecutionScore`（§5.2：条件步骤全部未触发不计入分母；被触发条件步骤中残留的 not_triggered 按 missed；原则扣分封顶；strict 模式逆序扣分并报告第一对逆序步骤；条件步骤不参与顺序检查；结果裁剪到 0–100）。
   - `recognition.ts`：`computeRecognition`（correct / partial / wrong 及得分，复用 `RECOGNITION_SCORE`）。
2. **`src/server/prompts/debrief.ts`**：`debriefTask`（`debrief@1`，温度 0.2），含提示词、输出 schema、`fake()`，以及全部语义校验（引用恰好出现一次且无未知引用；not_triggered 只用于条件步骤；done/partial/violated 必须有证据；evidence 与 rewrite 的 turn 在 `1..userTurnCount`；partial/missed 必须有 rewrite 且 conceptRefs 已知；quiz 必须有识别解释、drill 必须为 null）。同时导出 `buildDebriefRefs` / `buildSelectedInput` / `buildTranscript`（短引用 `s/k/p/c` 与转录格式）。
3. **`src/server/services/debrief.ts`**
   - `generateDebrief`：仅 `ended` / `debrief_failed` 可调用；组装输入（短引用、转录、阻力触发记录、quiz 的识别信息）→ `runTask` → 质量分收敛 → 证据核对与降级 → 识别（代码）→ 执行分（代码）→ 同一事务写 `debriefs` + `verdicts` 并置 `debriefed`。任何失败都把会话置为 `debrief_failed` 后原样抛出（接口层映射为 502/409）。同一场练习并发触发时复用同一次调用（页面重复触发不会重复烧 AI）。
   - `getDebrief`、`overrideVerdict`、`clearOverride`：改判/撤销后在事务内重算 `executionScore`、`scoreBreakdown`、`updatedAt`。
4. **`src/server/dto/debrief.ts`**：`DebriefDto`（识别、执行分与明细、整体印象分、说服结果、总结、按步骤分组的要点判定、原则判定、概念、已揭晓的 `SessionDto`〔含完整对话、场景隐藏字段、目标方法论骨架〕）、`VerdictDto`、`OverrideInput`、`OverrideResultDto`。
5. **接口**：`POST/GET /api/sessions/[id]/debrief`、`PUT/DELETE /api/verdicts/[id]/override`。
6. **页面**
   - `/practice/[sessionId]/debrief`：头部（执行分、整体印象分并注明不计入统计、说服结果、模式/难度/是否查看提示）、识别（仅 quiz，含备选、AI 解释、设计说明、错误时“对比两者”）、总结、扣分项、按步骤分组的要点卡片（判定、星级质量分、点评、可点击的证据、建议、降级提示、示范改写 + 概念讲解、改判/撤销改判）、原则、右侧完整对话（点击证据后滚动到该轮并高亮引用片段）。未触发的条件步骤折叠为“本场未触发”。改判弹窗（判定、质量分、必填理由）保存后即时刷新执行分。
   - 练习页：`ended` 状态进入即自动复盘（“正在复盘……”），失败显示错误与“重试复盘”；`debrief_failed` 显示重试按钮；`debriefed` 重定向到复盘页。
7. **测试**（新增 4 个文件 / 93 个用例）：`tests/domain/scoring.test.ts`（表驱动：全 done = 100、条件步骤排除/残留计 missed、原则扣分 0–4 条封顶、strict 逆序/同轮/最小轮次/无证据/条件步骤不参与/loose 不检查、裁剪与取整、收敛边界值、改判校验）、`tests/domain/evidence.test.ts`（精确/模糊/修正 turn/找不到/过短、降级表、识别三种结果）、`tests/server/debrief-task.test.ts`（引用与转录、fake 通过 schema+validate、每条语义校验）、`tests/server/debrief.test.ts`（Fake 复盘 verdicts 数 = 要点数 + 原则数、执行分、证据被核对、状态限制、并发去重、失败 → `debrief_failed` → 重试、降级/修正 turn/收敛/概念映射/顺序扣分、改判与撤销后分数变化、非法改判 400、quiz 三种识别、复盘前看不到隐藏字段而复盘后 GET 会话可见）。

### 验证方式

```
pnpm lint         # 通过
pnpm typecheck    # 通过
pnpm test         # 32 个文件 / 428 个用例通过（新增 4 个文件 / 93 个用例）
pnpm build        # 通过
```

另用 `AXIOM_FAKE_LLM=1` + 临时 `AXIOM_DATA_DIR` + `db:seed` 启动 `next start`，用 curl 走通：创建并开始专项练习 → 发 1 条消息 → 结束 → 复盘前 GET 返回 404 → `POST /debrief` 返回 200（执行分 40，条件步骤未计入）→ 改判一条要点后执行分变为 27 → 质量分不合规的改判返回 400 中文提示 → 撤销后恢复 40 → 复盘页返回 200 并渲染，练习页对已复盘会话 307 到复盘页。

### 已知限制

- **未在浏览器里逐项操作复盘页**（证据点击滚动高亮、改判弹窗、撤销、折叠对话、自动复盘的加载/失败/重试）：只有类型检查、lint、构建与页面 200 渲染验证，需要人工点一遍。
- **未用真实模型验证判定质量**：提示词效果（证据是否逐字、条件步骤的 not_triggered 与 missed 区分、rewrite 质量、识别解释）只在 Fake 与桩输出下验证；验收里“quiz 显示识别结果与解释”在 Fake 下满足。
- 复盘页底部只放了“开始新的练习”“返回首页”。“再练一次”“换个场景练同一方法论”依赖重练接口 `POST /api/scenarios/[id]/retry`，按计划属于 WP10，未提前实现。
- Fake 复盘取“第 1 轮用户原话前 10 字”作证据：若用户第 1 条消息归一化后不足 4 个字，证据核对不通过，Fake 下的 done 会被降级为 missed（真实流程无影响）。
- 执行分明细 `scoreBreakdown.steps[].value` 存 0–100（保留 1 位小数），而不是 0–1（`algorithms.md` §5.3 只写了 `number | null`）。
- 顺序检查里，某个非条件步骤若有 done/partial 要点、但这些要点没有任何有效证据（例如被用户改判为“做到”而 AI 没找到原话），该步骤无法确定首次出现时机，不参与顺序检查（`algorithms.md` §5.2 未明确这种情形）。
- 改判校验的具体口径（计划只写“套用 §5.1 规则，不合规返回 400”）：done 质量分须为 3–5 的整数、partial 为 1–3、missed/not_triggered 不得带质量分、非条件步骤不能改判为 not_triggered、原则只能在 kept/violated 之间改且不带质量分。改判为 done/partial 时质量分不能省略（不采用 AI 判定时的默认值）。
- 已复盘的练习不能重新复盘（`POST /debrief` 返回 409）；计划没有“重新评判”的需求。
- “AI 认为做到了但被降级为 missed”时不会补 `rewrite`（AI 当时没有为 done 给改写），页面上只显示降级提示。
- 复盘中 `refType='session'`、`refId=sessionId` 记入 `llm_calls`。

### 对公共契约的改动

均为向后兼容的补充，已同步 `docs/plan/`：

- `src/domain/constants.ts` 与 `README.md` §6 新增 `QUALITY_MAX`（5）、`QUALITY_DEFAULT`（done 3 / partial 2）、`EVIDENCE_QUOTE_CHARS`（4–80，仅用于提示词文案）。
- `PUT` / `DELETE /api/verdicts/[id]/override` 返回 `{ verdict: VerdictDto, executionScore, scoreBreakdown }`（计划只写“返回新的执行分与明细”，多了更新后的判定，供页面就地刷新）；撤销一条没有改判的判定返回 409。
- `POST /api/sessions/[id]/debrief` 返回 `DebriefDto`（与 `GET` 相同）；已复盘再调用返回 409；练习未结束返回 409。`GET` 在未复盘时返回 404 `not_found`。
- `DebriefDto` 的形状见 `src/server/dto/debrief.ts`。其中 `session` 复用 WP6 的 `SessionDto`（此时已揭晓）；`steps[].keyPoints[]` 与 `principles[]` 是 `VerdictDto`（含 AI 原始判定、降级标记、证据、示范改写、改判信息与生效判定/质量分）。
- `debrief` 任务输入的 `scenario` 只含可见字段 + 角色卡（阻力只带 `id/trigger/reaction`）+ `designNotes`；`selected` 的要点引用 `k1..` 在整个方法论内连续编号（不按步骤重置）。
