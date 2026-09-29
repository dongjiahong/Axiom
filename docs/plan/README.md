# Axiom 实现计划 · 总览

本目录是 Axiom MVP 的实现计划，供执行模型按工作包（WP）分工实现。开始任何工作前，先读：

1. `CONTEXT.md`：领域术语（代码命名必须与之对应，见下文映射表）
2. `docs/adr/`：已做出的架构决策，不要推翻
3. 本目录其余文档：

| 文档 | 内容 |
| --- | --- |
| `data-model.md` | 领域模型（Zod）、数据库表、隐藏字段下发规则 |
| `llm-and-prompts.md` | AI 调用层、JSON 修复重试、Fake 模式、6 类任务的提示词 |
| `algorithms.md` | 资料解析与分块、原文/证据核对、执行分、识别、掌握度、选题、统计口径 |
| `api-and-ui.md` | 接口列表、页面与交互流程 |
| `work-packages.md` | WP0–WP10：任务、产出、验收标准、测试要求 |

## 1. 产品一句话

本地单用户 Web 应用：导入沟通类书籍 → AI 抽取候选方法论 → 用户审阅确认 → AI 按方法论生成场景并扮演对方进行多轮对话 → 结束后复盘（识别 + 执行）→ 统计。

## 2. 技术栈（已由 ADR-0006 确定）

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 运行时 | Node.js 22 LTS，pnpm | |
| 框架 | Next.js（App Router，最新稳定版），React 19，TypeScript strict | 全部路由使用 Node runtime |
| 样式/组件 | Tailwind CSS v4，shadcn/ui（Radix），lucide-react | 界面文案全部中文 |
| 表单 | react-hook-form + @hookform/resolvers/zod | 方法论编辑器需要嵌套数组 |
| 客户端数据 | SWR（仅用于轮询任务进度、刷新列表） | 读取优先用 Server Component 直接调 service |
| 图表 | recharts | 趋势折线、分布柱状 |
| 数据库 | SQLite（better-sqlite3）+ Drizzle ORM + drizzle-kit 迁移 | `next.config` 中 `serverExternalPackages: ['better-sqlite3']` |
| 校验 | Zod | 领域模型、接口入参、AI 输出共用 |
| AI | `openai` npm SDK，指向用户配置的 OpenAI 兼容端点 | 单一模型（ADR-0006） |
| 解析 | jszip + fast-xml-parser + cheerio（epub）；unpdf（PDF）；chardet + iconv-lite（txt 编码） | |
| ID | nanoid | |
| 测试 | Vitest（单元/集成），Playwright（E2E 冒烟） | |
| 规范 | ESLint + Prettier | |

## 3. 架构分层

```
浏览器 (React 客户端组件)
   │  fetch /api/*（变更操作）      Server Components（读取，直接调 service）
   ▼                                   │
src/app/api/**/route.ts  ──────────────┤   ← 只做：解析入参(Zod) → 调 service → 映射 DTO
   ▼                                   ▼
src/server/services/*      ← 业务编排：事务、调用 AI 任务、调用领域纯函数
   │            │
   ▼            ▼
src/server/db   src/server/llm + src/server/prompts   ← 持久化 / AI 任务
   ▲
src/domain/*    ← 纯函数与类型：评分、识别、掌握度、选题、文本核对（无 IO，100% 单测）
src/server/parsing/*  ← 资料解析与分块（无 DB 依赖，可单测）
src/server/jobs/*     ← 进程内任务队列（抽取）
```

规则：

- `src/domain` 不得 import 任何 `server/*`、Next、数据库代码。
- 所有 AI 调用必须经过 `runTask()`（见 `llm-and-prompts.md`），不得在 service 或 route 里直接调 SDK。
- 所有返回给客户端的数据必须经过 DTO 映射函数（`src/server/dto/*`），隐藏字段规则见 `data-model.md` §4。

## 4. 目录结构

```
/                                  (仓库根 = 当前 Axiom 目录)
├─ AGENTS.md                       执行者须知
├─ CONTEXT.md                      领域术语
├─ docs/adr/  docs/plan/
├─ package.json  next.config.ts  drizzle.config.ts  vitest.config.ts  playwright.config.ts
├─ .env.example                    AXIOM_DATA_DIR / AXIOM_FAKE_LLM / AXIOM_LLM_*（可选覆盖）
├─ data/                           (gitignore) axiom.db, uploads/
├─ scripts/                        seed.ts, reset-db.ts, make-fixtures.ts
├─ tests/
│  ├─ fixtures/                    sample.epub, sample-gbk.txt, sample.md, sample.pdf, llm/*.json
│  └─ e2e/
└─ src/
   ├─ app/
   │  ├─ layout.tsx  page.tsx               首页
   │  ├─ settings/page.tsx
   │  ├─ sources/page.tsx  sources/[id]/page.tsx
   │  ├─ library/page.tsx  library/[id]/page.tsx  library/compare/page.tsx
   │  ├─ practice/new/page.tsx  practice/[sessionId]/page.tsx  practice/[sessionId]/debrief/page.tsx
   │  ├─ history/page.tsx
   │  ├─ stats/page.tsx
   │  └─ api/**/route.ts
   ├─ components/                  ui/(shadcn)  methodology/  practice/  debrief/  stats/  common/
   ├─ domain/
   │  ├─ constants.ts              所有可调常量（评分权重、掌握度参数、轮数上限默认值等）
   │  ├─ schemas.ts                领域 Zod 模型与类型
   │  ├─ text-match.ts             归一化 + 精确/模糊匹配
   │  ├─ evidence.ts               证据核对与降级
   │  ├─ scoring.ts                执行分
   │  ├─ recognition.ts            识别结果
   │  ├─ mastery.ts                掌握度
   │  ├─ selection.ts              加权随机选题
   │  └─ methodology-validate.ts   确认前校验
   ├─ server/
   │  ├─ db/                       schema.ts, client.ts, migrations/
   │  ├─ llm/                      client.ts, run-task.ts, json.ts, fake.ts, errors.ts, settings.ts
   │  ├─ prompts/                  extract-chunk.ts, cluster.ts, merge.ts, scenario.ts, counterpart.ts, debrief.ts
   │  ├─ parsing/                  epub.ts, pdf.ts, text.ts, markdown.ts, chunk.ts, detect.ts
   │  ├─ jobs/                     runner.ts, extract-source.ts
   │  ├─ services/                 settings, sources, extraction, methodologies, tags, scenarios, practice, debrief, stats
   │  ├─ dto/                      各实体的客户端 DTO 映射
   │  └─ http.ts                   统一错误响应、入参解析工具
   └─ instrumentation.ts           启动时恢复中断的任务
```

## 5. 术语 → 代码标识映射（强制）

| 术语 (CONTEXT.md) | 代码标识 | 取值 / 备注 |
| --- | --- | --- |
| 资料 | `Source` | format: `epub \| pdf \| txt \| md` |
| （章节块，实现概念） | `SourceChunk` | 抽取的最小单位 |
| 候选方法论 / 方法论 | `Methodology` | `status: 'draft' \| 'confirmed' \| 'archived'` |
| 方法论库 | 查询 `status='confirmed'` | |
| 方法论快照 | `MethodologySnapshot` | |
| 原文摘录 | `SourceExcerpt` | `{ text, chunkId, match: 'exact' \| 'fuzzy' \| 'none' }` |
| 推断内容 | `inferred: true` | 字段级标记 |
| 适用条件 / 反例 | `applicability` / `counterIndications` | `Item[]` |
| 步骤 / 条件步骤 | `Step` / `step.conditional === true` | 条件步骤必须有 `trigger` |
| 原则 | `Principle` | `kind: 'do' \| 'dont'` |
| 要点 | `KeyPoint` | |
| 概念 | `Concept` | |
| 标签 | `Tag` | |
| 合并建议 | `MergeSuggestion` | |
| 场景 | `Scenario` | |
| 目标方法论 / 备选方法论 | `targetMethodologyId` / `alternatives` | |
| 对方角色卡 / 计划阻力 | `CounterpartBrief` / `PlannedResistance` | |
| 难度 | `Difficulty` | `'cooperative' \| 'neutral' \| 'tough'`（配合/一般/强硬） |
| 选题 / 选题范围 | `SelectionMode` / `Scope` | `'pick' \| 'random'` |
| 练习 | `PracticeSession` | |
| 专项练习 / 综合测验 | `mode: 'drill' \| 'quiz'` | |
| 轮 | `turn` | 用户第 k 条消息为第 k 轮；对方开场白为第 0 轮 |
| 查看提示 | `hintUsed` | |
| 复盘 | `Debrief` | |
| 识别 | `Recognition` | `'correct' \| 'partial' \| 'wrong'` |
| 要点判定 | `KeyPointVerdict` | `'done' \| 'partial' \| 'missed' \| 'not_triggered'` |
| 原则判定 | `PrincipleVerdict` | `'kept' \| 'violated'` |
| 证据 | `Evidence` | `{ turn, quote, match }` |
| 执行分 / 整体印象分 | `executionScore` / `holisticScore` | 0–100 整数 |
| 说服结果 | `Outcome` | `'agreed' \| 'partial' \| 'refused' \| 'unresolved'` |
| 改判 | `Override` | |
| 示范改写 | `ModelRewrite` | |
| 掌握度 | `mastery` | 0–1 |
| 识别混淆 | `RecognitionConfusion` | |

## 6. 可调默认值（集中在 `src/domain/constants.ts`）

| 常量 | 默认 | 含义 |
| --- | --- | --- |
| `MAX_TURNS_DEFAULT` | 12 | 每场练习用户最多发言轮数，可在设置页修改 |
| `CHUNK_MIN_CHARS` / `CHUNK_MAX_CHARS` | 1500 / 20000 | 分块合并/切分阈值 |
| `EXTRACT_CONCURRENCY` | 2 | 抽取并发数 |
| `QUALITY_RANGE` | done: 3–5，partial: 1–3 | 判定与质量分一致性 |
| `PRINCIPLE_PENALTY` / `PRINCIPLE_PENALTY_CAP` | 10 / 30 | 违反原则扣分 |
| `ORDER_PENALTY` | 10 | 严格顺序错序扣分 |
| `MASTERY_WINDOW` | 5 | 掌握度取最近 N 场 |
| `MASTERY_W_EXEC` / `MASTERY_W_RECOG` | 0.6 / 0.4 | 执行与识别权重 |
| `MASTERY_HINT_FACTOR` | 0.7 | 查看过提示的练习执行分折算系数 |
| `MASTERY_HALF_LIFE_DAYS` | 30 | 时间衰减半衰期 |
| `SELECTION_EPSILON` | 0.1 | 加权随机的基础权重，保证高掌握度也有机会被抽到 |
| `MATCH_MIN_CHARS` / `FUZZY_THRESHOLD` | 4 / 0.7 | 文本核对阈值 |
| `LLM_TIMEOUT_MS` / `LLM_TRANSPORT_RETRIES` / `LLM_JSON_ATTEMPTS` | 180000 / 3 / 3 | AI 调用 |
| `LLM_LOG_MAX_CHARS` | 200000 | llm_calls 中请求/响应文本的最大保留字符数 |
| `MAX_TURNS_MIN` / `MAX_TURNS_MAX` | 4 / 30 | 设置页轮数上限的允许范围 |
| `UPLOAD_MAX_BYTES` | 52428800 | 资料上传的文件大小上限（50MB） |
| `PDF_MIN_CHARS_PER_PAGE` | 50 | 判定扫描版 PDF 的平均每页有效字符下限 |
| `PDF_HEADER_FOOTER_PAGE_RATIO` | 0.5 | 判定页眉/页脚时同一行文本需出现的页面比例 |
| `TOKEN_ESTIMATE_PER_CHAR` | 0.7 | 预估 token 的每字系数（界面标注"粗略估计"） |
| `TEXT_TITLE_MAX_CHARS` | 40 | 标题正则允许的最大行长 |
| `TEXT_NUMBERED_TITLE_MIN_COUNT` / `TEXT_NUMBERED_TITLE_MAX_COUNT` | 3 / 200 | 数字编号标题正则启用所需的全文匹配数范围 |
| `MD_SECTION_MIN_COUNT` / `MD_SECTION_MAX_COUNT` | 3 / 200 | Markdown 分节级别可接受的节数范围 |
| `FUZZY_SEGMENT_LENGTH` / `FUZZY_SEGMENT_STEP` | 8 / 4 | 模糊匹配时摘录切成的片段长度与步长 |
| `CLUSTER_BATCH_SIZE` / `CLUSTER_BATCH_OVERLAP` | 150 / 20 | 去重聚类的分批大小与相邻批次重叠条数 |
| `RECOGNITION_SCORE` | correct 1 / partial 0.5 / wrong 0 | 识别结果对应的得分，掌握度与统计共用 |
| `RESISTANCE_COUNT_RANGE` | 配合 1–2 / 一般 2–3 / 强硬 3–5 | 各难度允许的计划阻力数量 |
| `SCENARIO_RECENT_TITLES` | 10 | 场景生成时提供给 AI 的同一目标方法论最近场景标题数 |
| `SCENARIO_LEAK_MIN_STEP_TITLE_CHARS` | 4 | 可见字段泄露检查中，参与比对的步骤标题最短长度 |
| `QUIZ_MIN_SCOPE_SIZE` | 2 | 综合测验选题范围内至少需要的已确认方法论数 |
| `MESSAGE_MAX_CHARS` | 1000 | 用户单条消息的字数上限 |
| `COUNTERPART_REPLY_MAX_CHARS` / `COUNTERPART_REPLY_PROMPT_CHARS` | 300 / 120 | 对方回复的校验上限 / 提示词中要求的上限 |
| `QUALITY_MAX` | 5 | 质量分满分 |
| `QUALITY_DEFAULT` | done 3 / partial 2 | AI 未给质量分时的默认值 |
| `EVIDENCE_QUOTE_CHARS` | 4–80 | 提示词中要求的证据引用长度 |
| `STATS_TREND_LIMIT` | 30 | 统计概览中执行分趋势保留的最近场数 |
| `STATS_RECENT_WINDOW` | 5 | 统计概览中「最近 N 场」执行分均值取的场数 |
| `HOME_WEAKEST_COUNT` | 3 | 首页「最需要练习」列出的方法论数量 |

## 7. 工作包与依赖

```
WP0 脚手架
 └─ WP1 领域模型 + 数据库 + 种子数据
     └─ WP2 AI 层 + 设置页
         ├─ WP3 资料导入与解析 ── WP4 抽取流水线 ──┐
         ├─ WP5 方法论库与审阅（可先用种子数据开发）─┤
         └─ WP6 选题与场景生成 ── WP7 练习对话 ── WP8 复盘与改判 ── WP9 统计
                                                                    └─ WP10 首页/历史/重练/E2E/打磨
```

- WP3/WP4/WP5 与 WP6/WP7/WP8 两条线可并行：WP1 提供种子方法论，练习线无需等抽取线。
- WP3 实际只依赖 WP1（解析不调用 AI），可与 WP2 同时进行。
- WP10 需要所有 WP 完成。
- 每个 WP 的详细任务与验收标准见 `work-packages.md`。

## 8. 端到端数据流

```
上传文件 → parsing → Source + SourceChunk[]
  → [job extract_source]
      阶段1 每个 chunk：runTask(extractChunk) → 核对摘录 → Methodology(draft)[]
      阶段2 runTask(cluster) → 高置信组 → runTask(merge) → 新 draft，原 draft 归档
                            → 中置信组 → MergeSuggestion
  → 用户审阅 → confirm → Methodology(confirmed)

新建练习 → selection(pick | random by mastery) → runTask(scenario) → Scenario + PracticeSession(briefing)
  → (quiz) 用户从候选中选择 → start：写入快照 → active
  → 每轮：保存用户消息 → runTask(counterpart) → 保存回复 → 判断结束
  → ended → runTask(debrief) → 证据核对/降级 → 识别(代码) → 执行分(代码) → Debrief + verdicts
  → 改判 → 重算执行分
  → stats 聚合（只看 debriefed 的练习）
```
