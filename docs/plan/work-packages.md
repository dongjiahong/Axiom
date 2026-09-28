# 工作包

## 通用完成标准（每个 WP 都必须满足）

1. `pnpm lint`、`pnpm typecheck`、`pnpm test` 全部通过。
2. 新增的领域逻辑（`src/domain/*`）有单元测试；新增的 service 有基于内存 SQLite + Fake LLM 的集成测试。
3. 命名遵守 `docs/plan/README.md` §5 的术语映射；界面文案为中文，并与 `CONTEXT.md` 的术语一致（例如用"场景"而不是"题目"，用"练习"而不是"答题"）。
4. 不修改其他 WP 负责的公共契约（schemas、表结构、接口）；确需修改时在交付说明中写明原因与影响范围，并同步更新 `docs/plan/*`。
5. 交付说明包括：完成了什么、如何验证、已知限制。

集成测试基座（WP1 提供）：`createTestDb()` 返回迁移完成的内存数据库；`withFakeLLM()` 强制 Fake 模式。

---

## WP0 · 项目脚手架

**依赖**：无

**任务**
1. 在仓库根初始化 Next.js（App Router、TypeScript、Tailwind v4、ESLint、`src/` 目录），包管理器 pnpm，`engines.node >= 22`。
2. 初始化 shadcn/ui，先添加：button、input、textarea、label、card、badge、dialog、sheet、tabs、table、select、checkbox、switch、radio-group、dropdown-menu、tooltip、progress、sonner、separator、scroll-area、skeleton、alert。
3. 安装依赖：drizzle-orm、better-sqlite3、drizzle-kit、zod、nanoid、openai、jsonrepair、jszip、fast-xml-parser、cheerio、unpdf、chardet、iconv-lite、react-hook-form、@hookform/resolvers、swr、recharts、lucide-react；开发依赖 vitest、@vitest/coverage-v8、playwright、tsx、prettier。
4. `next.config.ts`：`serverExternalPackages: ['better-sqlite3']`。
5. `tsconfig` strict，路径别名 `@/* → src/*`。
6. `package.json` scripts：`dev`、`build`、`start`、`lint`、`typecheck`（`tsc --noEmit`）、`test`（vitest run）、`test:watch`、`e2e`、`db:generate`、`db:migrate`、`db:seed`、`db:reset`。
7. `.gitignore` 加入 `data/`；`.env.example` 包含 `AXIOM_DATA_DIR=./data`、`AXIOM_FAKE_LLM=0`、`AXIOM_LLM_BASE_URL=`、`AXIOM_LLM_API_KEY=`、`AXIOM_LLM_MODEL=`。
8. 基础布局：左侧导航（首页、资料、方法论库、开始练习、历史、统计、设置），各页面先放占位标题。
9. `git init` 并完成首次提交。

**验收**
- `pnpm dev` 启动后能访问所有占位页面；`pnpm lint && pnpm typecheck && pnpm test`（可只有一个占位测试）通过。

---

## WP1 · 领域模型、数据库、种子数据

**依赖**：WP0

**任务**
1. `src/domain/schemas.ts`：按 `data-model.md` §2 实现全部 Zod 模型与类型导出。
2. `src/domain/constants.ts`：按 `README.md` §6 实现全部常量。
3. `src/server/db/schema.ts`：按 `data-model.md` §3 实现全部表；`client.ts` 导出单例 `db`（路径 `${AXIOM_DATA_DIR}/axiom.db`，启动时自动建目录、开启 WAL 与外键、自动执行迁移）。
4. drizzle-kit 生成首个迁移。
5. `src/domain/methodology-validate.ts`：确认前校验（`api-and-ui.md` §2.2），返回中文问题列表（带字段路径）。
6. 测试基座：`tests/helpers/db.ts`（`createTestDb`）、`tests/helpers/llm.ts`（`withFakeLLM`）。
7. `scripts/seed.ts`：写入 4 个**已确认**方法论（各带标签，至少 2 个含条件步骤，至少 1 个为严格顺序，至少 1 个带概念），全部 `createdBy='seed'`、`sourceId=null`：
   - 向领导提加薪（职场，严格顺序，含"对方以预算为由拒绝"条件步骤）
   - 结论先行的工作汇报（职场）
   - 先共情再建议的安慰法（亲密关系，严格顺序）
   - 拒绝额外工作请求（职场，含"对方施压"条件步骤）
   另写入 1 个 draft 方法论，供 WP5 开发审阅界面。
8. `scripts/reset-db.ts`：删除数据库文件后重新迁移。

**验收**
- `pnpm db:reset && pnpm db:seed` 成功；种子数据通过 `MethodologyBody` 校验与确认校验。
- 单测：`methodology-validate` 覆盖每条规则的通过与失败。

---

## WP2 · AI 层与设置页

**依赖**：WP1

**任务**
1. `src/server/llm/settings.ts`：读写 `settings.llm`，环境变量覆盖，API Key 掩码。
2. `client.ts`：`OpenAICompatClient`（`llm-and-prompts.md` §2）。
3. `json.ts`：`extractJson`。
4. `run-task.ts`：`TaskDef` 与 `runTask`（§3），含 llm_calls 记录、修正重试、截断处理、AbortSignal 透传。
5. `errors.ts`：`LLMNotConfiguredError`、`LLMOutputError`、`LLMUnavailableError`、`LLMTruncatedError`，以及在 `src/server/http.ts` 中映射为 HTTP 错误。
6. `src/server/prompts/common.ts`：通用片段与 Zod 错误中文化工具。
7. 设置接口（`/api/settings*`）与设置页（`api-and-ui.md` §4.2），含测试连接。
8. 首页未配置 AI 的横幅。

**测试**
- `extractJson`：纯 JSON、代码块包裹、前后有解释文字、带 `<think>` 块、尾逗号（jsonrepair）、完全非法。
- `runTask`：用一个桩 `LLMClient` 模拟"第一次非法 JSON → 第二次 schema 不符 → 第三次正确"，断言第 2、3 次请求的 messages 中包含修正提示，并写入 3 条 llm_calls；三次都失败时抛 `LLMOutputError`。
- 设置：环境变量覆盖、API Key 不出现在 GET 响应中。

**验收**
- 配置一个真实的 OpenAI 兼容端点后测试连接成功；`AXIOM_FAKE_LLM=1` 时无需配置也能运行任务。

---

## WP3 · 资料导入与解析

**依赖**：WP1（可与 WP2 并行）

**任务**
1. `src/server/parsing/*`：detect、epub、pdf、text（含编码检测）、markdown、chunk（`algorithms.md` §1）。
2. `scripts/make-fixtures.ts`：生成测试夹具——带 nav 目录的 epub3（3 章中文，jszip 生成）、无目录 epub、GBK 编码的中文 txt（含"第一章…"标题）、多级标题的 md、带书签的英文 PDF（pdf-lib 生成，3 章）、无书签 PDF。夹具提交到 `tests/fixtures/`。
3. `services/sources.ts`：上传（保存到 `data/uploads/`）→ 解析 → 分块 → 写库（同一事务）；删除资料（规则见 `data-model.md` §3 sources）；跳过/恢复章节块。
4. 接口：`/api/sources*`（不含 extract 与 jobs）。
5. 页面：资料列表（上传）与详情（章节块表格、正文侧栏）；抽取相关按钮先禁用。

**测试**
- 每种夹具解析出的节数、标题、首尾文本符合预期；GBK txt 不乱码。
- 分块：合并过短节、切分过长节（标题带"（i/n）"）、跳过"目录/版权"。
- 扫描版判定：构造每页几乎无文本的 PDF，断言报出中文错误。
- 魔数与扩展名不一致时报错。

**验收**
- 在页面上传以上各类文件都能看到合理的章节列表。

---

## WP4 · 抽取流水线

**依赖**：WP2、WP3

**任务**
1. `src/domain/text-match.ts`：归一化（带下标映射）、`matchExcerpt`（`algorithms.md` §2–3）。
2. `src/server/prompts/extract-chunk.ts`、`cluster.ts`、`merge.ts`：TaskDef（提示词、schema、validate、fake），见 `llm-and-prompts.md` §5–7。
3. AI 输出 → 领域模型的映射：分配 ID、`relatedStepIndexes` → `relatedStepIds`、核对摘录、标签归一化。
4. `src/server/jobs/runner.ts`、`extract-source.ts`（`api-and-ui.md` §2.1），`src/instrumentation.ts` 恢复中断任务。
5. `services/extraction.ts`：入队、取消、重试失败章节、合并建议的生成。
6. 接口：`POST /api/sources/[id]/extract`、`/api/jobs/*`。
7. 资料详情页：开始抽取（确认框含预估 token）、进度轮询、取消、重试失败章节、候选方法论列表、合并建议列表（接受/忽略按钮可先调用 WP5 的接口，WP5 未完成时先隐藏）。

**测试**
- `matchExcerpt`：精确命中（含标点、空白、全半角差异）、模糊命中、不命中、过短、多 haystack 时返回正确 chunkId、还原出的原文片段正确。
- 集成（Fake LLM）：导入夹具 → 抽取 → 每个非空章节块产生 draft；摘录全部为 exact；重复抽取同一块不会产生重复 draft（幂等）；名称相同的 draft 被自动合并且原 draft 归档；medium 组生成合并建议（用桩任务构造）。
- 取消：处理中取消后 job 为 cancelled，未处理块为 pending，再次入队可继续。
- 失败块：桩任务对某个块始终抛错，job 完成后该块为 failed，其余正常。

**验收**
- 用真实模型导入一本中文沟通类书（epub），能在页面看到进度并产出候选方法论；刷新页面或重启服务后进度能恢复。

---

## WP5 · 方法论库与审阅

**依赖**：WP1、WP2（合并需要 AI）；与 WP4 并行开发，用种子 draft 调试

**任务**
1. `services/methodologies.ts`、`services/tags.ts`：列表查询、保存（补 ID、标签自动创建、确认后 version+1）、状态迁移、拆分、合并（调用 merge 任务，excerpt 在来源块并集中重新核对）、合并建议接受/忽略（`api-and-ui.md` §2.2）。
2. 接口：`/api/methodologies*`、`/api/merge-suggestions*`、`/api/tags`。
3. 页面：方法论库列表（§4.4）、编辑页（§4.5，含原文抽屉与高亮）、对比页（§4.6）。
4. 在资料详情页接入合并建议的接受/忽略。

**测试**
- 状态迁移：非法迁移返回 409；确认校验失败返回 400 且列出所有问题。
- 保存：已确认方法论保存后 version+1；新节点被补上 ID；已存在节点 ID 不变。
- 拆分：新旧方法论的步骤划分正确；拆完原方法论没有非条件步骤时拒绝。
- 合并：原 draft 归档且 `mergedIntoId` 正确；restore 可撤销。
- 删除资料：draft 被删除，confirmed 保留且 `sourceId` 置空。

**验收**
- 可以在页面上完成：编辑一个 draft 的各字段 → 查看原文高亮 → 确认入库 → 在已确认列表中看到它。

---

## WP6 · 选题与场景生成

**依赖**：WP2；用种子数据开发（不依赖 WP3–WP5）

**任务**
1. `src/domain/mastery.ts`、`selection.ts`（`algorithms.md` §7–8）。
2. `src/server/prompts/scenario.ts`（`llm-and-prompts.md` §8），含全部语义校验（可见字段不泄露方法论名称等）。
3. `services/scenarios.ts`：resolveScope → 选题（random 时从 stats 数据计算掌握度）→ 组装输入（others = 范围内其余已确认方法论；recentTitles）→ runTask → 映射 ID → 写 scenario。
4. `services/practice.ts` 的创建部分：`POST /api/practice` 创建 scenario + session(briefing)。
5. `src/server/dto/session.ts`：会话 DTO，严格实现 `data-model.md` §4。
6. 接口：`POST /api/practice`、`GET /api/sessions/[id]`、`POST /api/sessions/[id]/select`、`/start`、`/hint`。
7. 页面：新建练习（§4.7）、练习页 briefing 状态（§4.8）。

**测试**
- mastery：从未练习 = 0；执行与识别的加权；查看提示的折算；时间衰减（刚练过 decay=1，30 天后 0.75）。
- selection：固定 rng 下的抽取结果；范围解析（并集、全空=全部）；quiz 范围 < 2 时报错。
- scenario 语义校验：可见字段含方法论名称时报错；阻力数量不符合难度时报错；linkedStepRef 指向非条件步骤时报错。
- **DTO 泄露测试**（`data-model.md` §4 的测试要求）。
- start：quiz 未选择时 409；快照正确写入；开场白插入为 turn 0。

**验收**
- 用种子数据分别创建专项练习与综合测验，briefing 页面信息正确，quiz 看不到答案。

---

## WP7 · 练习对话

**依赖**：WP6

**任务**
1. `src/server/prompts/counterpart.ts`（`llm-and-prompts.md` §9）。
2. `services/practice.ts` 对话部分：发消息、重试生成回复、手动结束、结束判定（`api-and-ui.md` §2.3）。
3. 接口：`/messages`、`/regenerate`、`/end`。
4. 页面：练习页 active 与 ended 状态（§4.8），包括轮数显示、提示抽屉、失败重试、结束确认、结束后自动触发复盘（复盘接口由 WP8 提供，WP8 完成前显示"复盘功能开发中"）。

**测试**
- turn 计算：有开场白与无开场白两种情况。
- 对方 `end` 非空时会话结束且 endReason 正确；达到 maxTurns 时以 turn_limit 结束；最后一轮提示被加入 messages。
- 对方回复失败：用户消息保留，再发消息返回 409，regenerate 后恢复正常。
- 结束时没有用户消息 → 会话被删除。
- 已结束会话发消息 → 409。

**验收**
- Fake 模式和真实模型下都能完成一场 5 轮以上的对话，对方回复不跳出角色、会按计划阻力施压（真实模型下人工检查）。

---

## WP8 · 复盘与改判

**依赖**：WP7

**任务**
1. `src/domain/evidence.ts`、`scoring.ts`、`recognition.ts`（`algorithms.md` §4–6）。
2. `src/server/prompts/debrief.ts`（`llm-and-prompts.md` §10），含全部语义校验。
3. `services/debrief.ts`：组装输入（短引用映射、transcript、阻力触发记录）→ runTask → 质量分收敛 → 证据核对与降级 → 识别 → 执行分 → 事务写入；改判与撤销改判后重算。
4. `src/server/dto/debrief.ts`。
5. 接口：`POST/GET /api/sessions/[id]/debrief`、`/api/verdicts/[id]/override`。
6. 页面：复盘页（§4.9），含证据点击滚动高亮、改判弹窗。

**测试**
- scoring（重点，表驱动）：全部 done 5 分 = 100；条件步骤全部 not_triggered 被排除出分母；被触发的条件步骤中残留 not_triggered 按 missed 计；原则扣分封顶 30；严格顺序逆序扣 10 并报告逆序对；条件步骤不参与顺序检查；loose 模式不检查顺序；结果裁剪到 0–100。
- 质量分收敛：各边界值。
- evidence：精确、模糊、turn 错但能在其他轮找到时修正 turn、找不到时降级（done→missed，violated→kept）。
- recognition：三种结果。
- 集成：Fake 复盘后 verdicts 数量 = 要点数 + 原则数；改判后执行分变化正确；撤销改判后恢复；quiz 复盘后 GET 会话能看到隐藏字段。

**验收**
- 完成一场练习后能看到完整复盘；改判后分数即时更新；quiz 显示识别结果与解释。

---

## WP9 · 统计

**依赖**：WP8

**任务**
1. `services/stats.ts`：概览、识别混淆、难度分层（`algorithms.md` §9），掌握度复用 `domain/mastery.ts`。
2. 接口：`/api/stats/*`。
3. 页面：统计页（§4.11）。
4. 首页"最需要练习"模块接入掌握度。

**测试**
- 构造一组已复盘练习（含改判、查看提示、quiz 识别正确/部分/错误、不同难度、已归档方法论），断言三个接口的每个字段。
- 未复盘的练习不被统计。

**验收**
- 做几场练习后，三个视图的数据与历史记录一致。

---

## WP10 · 首页、历史、重练、E2E、打磨

**依赖**：全部

**任务**
1. 首页（§4.1）、历史页（§4.10）、重练接口与入口。
2. 全局：加载态、空状态引导、错误提示（sonner）、未保存修改提示。
3. Playwright E2E（`AXIOM_FAKE_LLM=1`，独立数据目录）：
   - 上传 txt 夹具 → 抽取完成 → 编辑并确认一个方法论 → 专项练习：查看提示、发 2 条消息、结束 → 复盘页显示执行分 → 改判一条 → 统计页显示 1 场练习。
   - 综合测验：选择方法论 → 对话 → 复盘显示识别结果。
4. `README.md`：安装、配置、启动、数据目录、Fake 模式说明。

**验收**
- `pnpm e2e` 通过；按 README 从零启动可以完成一次完整流程。
