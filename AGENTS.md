# Axiom · 执行者须知

## 项目是什么

把书籍里的沟通方法论抽取成结构化骨架，再由 AI 生成情景并扮演对方与用户多轮对话练习，最后评判"方法选得对不对"（识别）和"步骤做得到不到位"（执行），并做统计。

- 本地单用户 Web 应用，也可部署到自己的服务器（此时用 `AXIOM_ACCESS_PASSWORD` 门禁，见下文）。没有账号系统。
- 技术栈：Next.js 16（App Router）+ React 19 + TypeScript + Tailwind v4 + shadcn/ui；SQLite（better-sqlite3 + drizzle-orm）；一个 OpenAI 兼容模型；Zod 4；SWR；Vitest；Playwright。
- 界面与内容全部中文。用户操作流程见 `README.md`。

## 开始前必读

1. `CONTEXT.md`：领域术语表（中文）与概念关系。代码命名、界面文案都必须使用这里的术语，不要另造同义词（如"题目""技巧"）。
2. `README.md`：配置、数据目录、部署、门禁。
3. 原来的实现计划和 ADR（`docs/`）已删除，只在 git 历史中（`git log --stat -- docs`）。它们记录过算法口径和一些取舍；现在以代码和测试为准。

## 术语与代码标识

| 术语 | 代码 |
| --- | --- |
| 资料 / 章节块 | `sources` / `source_chunks`，`SourceFormat`：epub、pdf、txt、md |
| 候选方法论 / 方法论 / 归档 | `methodologies.status`：`draft` / `confirmed` / `archived` |
| 方法论正文（步骤、要点、原则、概念、适用条件、反例） | `MethodologyBody`（JSON 文档，每个节点有稳定 ID），见 `src/domain/schemas.ts` |
| 方法论快照 | `MethodologySnapshot`，存在练习上，历史练习不受后续修改影响 |
| 难度：配合 / 一般 / 强硬 | `Difficulty`：`cooperative` / `neutral` / `tough` |
| 选题：指定 / 随机；选题范围 | `SelectionMode`：`pick` / `random`；`Scope`（标签取交集、资料可选其一） |
| 场景 / 对方角色卡 / 计划阻力 | `scenarios` / `CounterpartBrief` / `PlannedResistance` |
| 练习 | `practice_sessions`，状态 `briefing → active → ended → debriefed`（复盘失败为 `debrief_failed`） |
| 复盘 / 要点判定与原则判定 / 改判 | `debriefs` / `verdicts`（`kind`：`key_point` / `principle`）/ override |
| 判定值 | 要点 `done` `partial` `missed` `not_triggered`；原则 `kept` `violated` |
| 说服结果 | `Outcome`：`agreed` `partial` `refused` `unresolved` |
| 执行分 | `ScoreBreakdown`，由 `src/domain/scoring.ts` 计算 |
| 合并建议 / 标签 | `merge_suggestions` / `tags`、`methodology_tags` |
| 抽取任务 | `jobs`（类型 `extract_source`），进程内队列 |

## 目录

```
src/
  app/            页面（服务端组件，直接调用 service）与 app/api/* 路由
  components/     按功能分目录：common（外壳、导航、设置、门禁表单）、sources、methodology、
                  practice、debrief、history、home、stats；ui 是 shadcn 组件
  domain/         纯函数与类型：schemas（Zod 领域模型）、constants（所有可调参数）、
                  scoring、mastery、selection、evidence、text-match、methodology-validate
  lib/            前端小工具（utils、use-media-query）
  server/
    db/           schema.ts（表）、client.ts（连接、迁移）、migrations/（drizzle 生成）
    dto/          返回给客户端的数据结构与映射
    services/     业务逻辑：sources、extraction、methodologies、tags、scenarios、practice、debrief、stats、settings
    llm/          run-task（唯一的 AI 调用入口）、client、fake、json 提取、call-log、settings
    prompts/      每个 AI 任务一个文件：提示词、输出 schema、语义校验、fake
    parsing/      资料解析与分块（epub / pdf / txt / md）
    extraction/   抽取流水线：聚类、合并、草稿落库、合并建议
    jobs/         任务队列与 extract_source 处理器
    gate.ts       门禁（口令、签名 cookie、失败限流）
    http.ts       ApiError、route() 包装、parseJson
  proxy.ts        门禁的拦截入口（Next 16 的 proxy，等同旧版 middleware）
  instrumentation.ts  启动时恢复中断的任务、生产环境缺口令告警
scripts/          seed（种子方法论）、reset-db、make-fixtures
tests/            domain、server、e2e、fixtures、helpers
deploy/           nginx 与 systemd 配置
```

## 数据流

1. **抽取**：上传资料 → `parsing` 解析并分块 → `jobs` 队列跑 `extract_source`：逐块 `extract_chunk` → `cluster` 聚类 → `merge` 合并，产出 `draft` 方法论与合并建议 → 用户在编辑页审阅并"确认入库"（`methodology-validate` 校验）。
2. **出题**：`selection` 解析候选池（标签取交集）并指定或随机选出目标方法论 → `scenario` 任务生成场景（含隐藏的对方角色卡）→ 创建练习并冻结方法论快照。
3. **对话**：每次用户发言由 `counterpart` 任务生成对方回复；对话中不做任何点评。
4. **复盘**：`debrief` 任务返回要点判定、原则判定、示范改写等 → 代码核对证据并降级 → 代码计算执行分 → 落库；用户可改判，之后重算。
5. **统计**：只统计 `debriefed` 的练习，分数用改判后重算的执行分；执行归属于场景的目标方法论。

## 硬性规则

- 使用中文编写界面文案与面向用户的错误信息；代码标识使用英文。
- `src/domain/*` 只放纯函数与类型，不得依赖数据库、Next 或网络。
- 所有 AI 调用必须通过 `runTask()`（`src/server/llm/run-task.ts`）；不得在 service 或路由中直接调用 SDK。
- 所有返回给客户端的数据必须经过 `src/server/dto/*` 映射。对方角色卡、场景设计说明、消息 meta、方法论骨架在复盘前不得泄露；隐藏字段在未揭晓时连键都不能出现（不是 `null`）。判断是否揭晓用 `isRevealed()`。
- 评分、掌握度、证据核对都由代码计算，不得改由 AI 直接给出。AI 只给判定、质量分、点评和引用的原话；引不出证据的"做到"一律不成立。
- 可调参数只能放在 `src/domain/constants.ts`，不要在代码中写魔法数字。
- API Key 不得写入日志、llm_calls、错误信息或任何接口响应；接口只返回掩码。
- 修改 AI 输出 schema 时，同步修改该任务的 `schemaDescription` 与 `fake()`，并递增 `promptVersion`。
- 方法论快照不可变：练习开始后修改方法论不能影响历史练习的评判与统计。
- 只能跑一个实例：数据在本地 SQLite，抽取任务在进程内排队。不要引入多进程、多副本的假设。

## 写代码的约定

- **路由**：`src/app/api/**/route.ts` 只做薄封装：`export const POST = route(async (req, ctx) => …)`，用 `parseJson(req, ZodSchema)` 解析入参，业务全部在 `server/services`。错误用 `ApiError(status, code, 中文消息)` 抛出，`route()` 统一转成 `{ error: { code, message } }`。路由需要 `export const runtime = "nodejs"` 与 `dynamic = "force-dynamic"`。
- **service**：函数最后一个参数接收 `database: AppDatabase = db`，测试传入内存库。AI 任务通过 `TaskContext`（`db`、`client`、`signal`）注入。
- **页面**：服务端组件直接调用 service 取数据（不经 HTTP），交互部分放到客户端组件；需要轮询或按需加载的地方用 SWR。
- **新增 AI 任务**：在 `server/prompts/` 新建文件，导出 `TaskDef`（`name`、`promptVersion`、`temperature`、`schema`、`build`、可选 `validate`、`fake`），并在 `LLMTaskName` 里登记。`fake()` 必须能通过自己的 schema 与 `validate`，否则 Fake 模式会抛错。
- **改表结构**：改 `src/server/db/schema.ts`，运行 `pnpm db:generate` 生成迁移并提交；迁移在应用启动时自动执行。主键是 nanoid 字符串，时间是 Unix 毫秒，JSON 列存 JSON 字符串。
- **界面**：手机和桌面都要能用（`md` 以上是侧边栏，以下是顶栏加抽屉）。表格类页面在小屏用卡片列表替代。新增页面在 375px 宽下检查一遍。样式用 Tailwind 与现有 shadcn 组件。
- **门禁**：`AXIOM_ACCESS_PASSWORD` 非空时，`src/proxy.ts` 拦截所有页面和 `/api/*`（`/api/gate` 与 `/gate` 除外）。新增路由默认已被保护，不需要额外处理。
- **React 19 lint**：`react-hooks/set-state-in-effect` 会报错，避免在 effect 里同步 `setState`；用事件回调或派生值。

## 命令

```
pnpm dev            # 启动开发服务器（默认 3000）
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest（tests/ 下，e2e 除外）
pnpm e2e            # Playwright，端口 3100，自动使用 AXIOM_FAKE_LLM=1 和独立数据目录 data/e2e
pnpm db:generate    # 由 schema.ts 生成迁移
pnpm db:reset && pnpm db:seed   # 重置并写入种子数据
```

- 无 API Key 时设置 `AXIOM_FAKE_LLM=1` 即可开发与测试，所有 AI 任务返回确定性假数据。
- 一个目录下 Next 只允许一个 dev 实例。用户的 dev server 在 3000 端口运行时 `pnpm e2e` 起不来；需要另开实例时复制仓库到临时目录并换端口，不要杀用户的进程。
- 测试基座：`tests/helpers/db.ts` 的 `createTestDb()` 给内存数据库（已迁移）；`tests/helpers/llm.ts` 的 `withFakeLLM()` 强制 Fake 模式。资料解析的夹具由 `scripts/make-fixtures.ts` 生成。

## 交付

每项改动完成时，`pnpm lint && pnpm typecheck && pnpm test` 必须通过，并在交付说明中写明：完成内容、验证方式、已知限制、对公共契约（接口、DTO、表结构、AI 输出 schema）的任何改动。涉及页面的改动，用真实浏览器看一遍桌面和手机宽度。

## 已知遗留

- `src/components/common/placeholder-page.tsx` 目前没有页面在用。
- 应用没有"退出登录"，门禁限流状态存在内存里，重启清零。
