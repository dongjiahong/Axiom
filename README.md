# Axiom

把书籍中的沟通方法论抽取成骨架，再用 AI 生成情景、扮演对方进行多轮对话练习，并对“方法选得对不对”和“步骤做得到不到位”进行评判与统计。

本地单用户 Web 应用（见 `docs/adr/0006-local-single-user-typescript.md`）：Next.js 全栈 TypeScript + 本地 SQLite + 单个 OpenAI 兼容模型，界面与内容全部中文。

## 安装

要求 Node.js 22+ 与 pnpm 10。

```bash
pnpm install
pnpm exec playwright install chromium   # 只有要跑端到端测试时才需要
```

## 配置

复制 `.env.example` 为 `.env.local`（Next 会读取 `.env` 与 `.env.local`）：

| 变量 | 说明 |
| --- | --- |
| `AXIOM_DATA_DIR` | 数据目录，默认 `./data` |
| `AXIOM_FAKE_LLM` | 设为 `1` 时所有 AI 任务返回确定性的假数据，无需配置模型 |
| `AXIOM_LLM_BASE_URL` | OpenAI 兼容端点的 Base URL |
| `AXIOM_LLM_API_KEY` | API Key |
| `AXIOM_LLM_MODEL` | 模型名 |

也可以在设置页（`/settings`）填写 Base URL / API Key / 模型名，保存在本机数据库里（明文，仅本机单用户）。环境变量存在时优先于设置页，设置页会提示“已被环境变量覆盖”。

API Key 不会写入日志、`llm_calls`、错误信息或任何接口响应；接口只返回掩码（如 `sk-****abcd`）。

## 启动

```bash
pnpm db:migrate    # 首次运行或升级后执行迁移（pnpm db:reset 会自动迁移）
pnpm db:seed       # 可选：写入 4 个已确认 + 1 个候选的种子方法论
pnpm dev           # 开发模式，http://localhost:3000
```

生产模式：`pnpm build && pnpm start`。

## 从零走一遍完整流程

1. **设置**：配置模型（或设 `AXIOM_FAKE_LLM=1` 免配置）。首页在未配置时会有引导横幅。
2. **资料**：在 `/sources` 上传一本沟通类书籍（epub / txt / 文字版 PDF / Markdown）。
3. **抽取**：打开资料详情页点“开始抽取”，等待进度条走完，页面下方出现“本资料的候选方法论”。
4. **审阅**：点候选方法论进入编辑页，核对原文摘录、修改内容，点“确认入库”进入方法论库。
5. **练习**：在 `/practice/new` 选择专项练习（目标方法论可见）或综合测验（目标隐藏、开场前自选），设定选题范围与难度后“生成场景”。
6. **对话**：在练习页与 AI 扮演的对方进行多轮对话（专项练习可展开方法论骨架）；结束后自动进入复盘。
7. **复盘**：查看识别结果、要点判定、示范改写与执行分，可对单条判定“改判”；再从底部“再练一次”或“换个场景练同一方法论”继续。
8. **历史与统计**：`/history` 查看每一场练习，`/stats` 看方法论概览、识别混淆与难度分层。

## 数据目录

所有数据都在 `AXIOM_DATA_DIR`（默认 `./data`，已加入 `.gitignore`）：

- `axiom.db`（含 `-wal` / `-shm`）：SQLite 数据库，启动时自动建目录、开启 WAL 与外键并执行迁移。
- `uploads/<id>.<ext>`：上传的原始资料。

备份就是复制这个目录。想推倒重来执行 `pnpm db:reset`（删除数据库文件后重新迁移），再 `pnpm db:seed` 写入种子数据。

## Fake 模式（无 API Key 开发与测试）

`AXIOM_FAKE_LLM=1` 时不访问任何网络：抽取、场景生成、对方回复、复盘都返回确定性的假数据，界面与接口完全一致，便于开发与自动化测试。

```bash
AXIOM_FAKE_LLM=1 pnpm dev
```

`pnpm e2e` 的 Playwright 配置会自动用 Fake 模式与独立数据目录 `./data/e2e` 启动服务，并在每次运行前 `db:reset && db:seed`，因此端到端测试从零开始、结果可重复。

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest（单元与集成测试，内存 SQLite + Fake LLM） |
| `pnpm e2e` | Playwright 端到端冒烟（自动使用 Fake 模式与独立数据目录） |
| `pnpm db:generate` / `pnpm db:migrate` | 生成 / 执行 Drizzle 迁移 |
| `pnpm db:seed` | 写入种子方法论 |
| `pnpm db:reset` | 删除数据库文件后重新迁移 |

## 文档

- `CONTEXT.md`：领域术语（代码命名与界面文案都必须使用这里的术语）。
- `docs/adr/`：已确定的架构决策。
- `docs/plan/`：实现计划（数据模型、AI 提示词、算法口径、接口与页面、工作包、交付说明）。
- `AGENTS.md`：执行者须知（分层规则、硬性约束）。
