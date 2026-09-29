# 服务流程、接口与页面

## 1. 通用约定

- 路由文件顶部 `export const runtime = 'nodejs'`；`export const dynamic = 'force-dynamic'`。
- 入参统一用 Zod 解析（`src/server/http.ts` 提供 `parseJson(req, schema)`）。
- 错误响应：`{ error: { code: string, message: string, issues?: { path: string, message: string }[] } }`，`message` 为可直接展示的中文；`issues` 仅在逐条校验失败时出现（如确认入库），`path` 为表单字段路径（如 `steps[0].title`）。

| 情况 | HTTP | code |
| --- | --- | --- |
| 入参不合法 | 400 | `invalid_input` |
| 资源不存在 | 404 | `not_found` |
| 状态不允许（如对已结束会话发消息） | 409 | `invalid_state` |
| 未配置 AI | 409 | `llm_not_configured` |
| AI 多次输出不合规 | 502 | `llm_invalid_output` |
| AI 端点报错/超时 | 502 | `llm_unavailable` |

- 读取类页面优先在 Server Component 中直接调用 service + DTO；客户端组件只在需要交互或轮询时调接口。

## 2. 服务流程

### 2.1 抽取任务（`src/server/jobs/*`）

进程内任务队列 `JobRunner`（单例挂在 `globalThis`，避免开发模式热更新产生多个实例）：

- `enqueue(type, payload)` 写入 `jobs` 表（queued）并唤醒调度。
- 调度：同一时间只运行 1 个 job；job 内部按 `EXTRACT_CONCURRENCY` 并发处理章节块。
- 取消：`cancel(jobId)` 设置 AbortController，正在进行的 AI 请求被中止，job 标为 cancelled，未完成章节块保持 pending。
- `src/instrumentation.ts` 的 `register()`：服务启动时把 `running` 的 job 改回 `queued`、`running` 的章节块改回 `pending`，然后恢复调度。

`extract_source` 处理器：

```
stage = 'chunks'
  chunks = 该资料 extractionStatus in (pending, failed) 的块
  progressTotal = 非 skipped 块总数；progressDone = 已 done 块数
  并发处理每个块：
    标 running
    删除该块此前产生的 draft（createdBy='extraction' 且 originChunkIds = [该块]）——保证重试幂等
    out = runTask(extractChunk, {...})
    对每个方法论：分配 ID → 核对摘录（haystack = 该块）→ 归一化标签 → 插入 draft
    标 done（失败标 failed 并记录错误，不中断其他块）
stage = 'cluster'
  drafts = 该资料 createdBy in (extraction) 且 status=draft 的方法论
  若 ≥2：groups = runTask(cluster, ...)
stage = 'merge'
  high 组：runTask(merge) → 插入新 draft（createdBy='merge'）→ 原 draft 归档并设 mergedIntoId
  medium 组：写入 merge_suggestions(open)
stage = 'done'
  资料 status = extracted（若有 failed 块，仍为 extracted，但页面提示"N 个章节失败，可重试"）
```

用户点"重试失败章节"时重新入队同一类 job，只处理 failed 块；cluster/merge 阶段只针对**本次新产生**的 draft 与已有 draft 一起聚类，已被归档的不再参与。

### 2.2 方法论生命周期

```
draft ──confirm──▶ confirmed ──unconfirm──▶ draft
  │                    │
  └──archive──▶ archived ◀──archive──┘      archived ──restore──▶ draft
```

- confirm 前执行 `methodology-validate.ts`：名称非空；至少 1 条适用条件；至少 1 个非条件步骤；每步至少 1 个要点；条件步骤必须有 trigger；再加 `MethodologyBody` 严格校验（步骤标题、要点文本不能为空等）；不通过返回 400 并在 `error.issues` 中列出所有问题。
- confirmed 状态下保存 → `version + 1`。
- 合并/拆分只允许作用于 draft。
- 合并（手动或接受建议）：`runTask(merge)` → 新 draft（createdBy='merge'），原 draft 归档（mergedIntoId 指向新 draft）。撤销合并 = 对原 draft 执行 restore（只恢复被点的这个），并归档合并结果（仅当合并结果仍是 draft；已确认的不动），其他原 draft 保持归档。
- 拆分：选中若干步骤 → 新 draft（复制名称加"（拆分）"、适用条件、反例、原则、概念，只含选中步骤；createdBy='split'）；原方法论移除这些步骤（至少保留 1 个非条件步骤，否则 400）。

### 2.3 练习生命周期

```
POST /api/practice ──▶ briefing ──start──▶ active ──(用户结束 | 对方收尾 | 到达轮数上限)──▶ ended
                                                                                              │
                                              debriefed ◀──成功── POST /debrief ──失败──▶ debrief_failed ──重试──▶ …
```

- **创建**（`POST /api/practice`）：校验与选题（`algorithms.md` §8）→ `runTask(scenario)` → 插入 scenario → 插入 session（briefing；drill 时 `selectedMethodologyId = target`；`maxTurns` 取设置值）。
- **选择**（quiz，briefing 状态）：`POST /select { methodologyId }`，必须在 `candidateIds` 中，可多次修改。
- **开始**（briefing → active）：quiz 必须已选择；写入 `targetSnapshot`、`selectedSnapshot`、`startedAt`；`openingSpeaker='counterpart'` 时插入开场白消息（turn 0）。
- **发消息**（active）：
  1. 若最后一条消息是用户消息且没有对方回复（上次生成失败），返回 409，提示先"重试生成回复"。
  2. 插入用户消息（turn = 已有用户消息数 + 1）。
  3. `runTask(counterpart)`；失败则保留用户消息、返回 502，前端显示"重试生成回复"。
  4. 插入对方回复（meta 记录 firedResistanceIds、end）。
  5. `end` 非空 → ended（endReason = end.type，endNote = end.note）；否则 turn ≥ maxTurns → ended（turn_limit）。
  6. 返回 `{ messages: [用户消息, 对方回复], session: { status, endReason, turn, maxTurns } }`。
- **重试生成回复**：`POST /regenerate`，仅当最后一条是用户消息时可用，执行上面第 3–6 步。
- **手动结束**：`POST /end` → ended（endReason='user'）。至少要有 1 条用户消息，否则直接删除该会话并返回 `{ deleted: true }`。
- **查看提示**（drill，active 或 briefing）：`POST /hint` → `hintUsed = true`，返回方法论骨架 DTO。
- **复盘**：`POST /debrief`（ended 或 debrief_failed）→ 组装输入 → `runTask(debrief)` → 质量分收敛 → 证据核对与降级 → 识别（代码）→ 执行分（代码）→ 同一事务内写 debriefs + verdicts → debriefed。失败 → debrief_failed，返回 502。
- **重练**：`POST /api/scenarios/[id]/retry { mode? }` → 以同一场景新建 session（briefing），mode 默认沿用上次。

## 3. 接口清单

### 设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/settings` | `{ llm: { baseUrl, model, apiKeyMasked, supportsJsonMode, supportsTemperature, testedAt, overriddenByEnv }, practice: { maxTurns } }` |
| PUT | `/api/settings/llm` | `{ baseUrl, apiKey?, model }`；apiKey 省略表示不修改；修改后清空能力探测结果 |
| POST | `/api/settings/llm/test` | 见 `llm-and-prompts.md` §2 |
| PUT | `/api/settings/practice` | `{ maxTurns: 4–30 }` |

### 资料与任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/sources` | multipart `file`；同步解析与分块（大文件也应在数秒内完成），返回 source DTO（含章节块摘要） |
| GET | `/api/sources` | 列表：标题、格式、字数、状态、章节数、候选/已确认方法论数 |
| GET | `/api/sources/[id]` | 详情 + 章节块列表（seq、title、charCount、extractionStatus、error，不含正文）+ 当前 job + 预估 token（总字数 × 0.7，标注"粗略估计"） |
| DELETE | `/api/sources/[id]` | 删除资料、章节块、上传文件、draft；保留 confirmed/archived |
| GET | `/api/sources/[id]/chunks/[chunkId]` | 章节块正文（用于原文核对侧栏） |
| PATCH | `/api/sources/[id]/chunks/[chunkId]` | `{ skipped: boolean }`，在 skipped 与 pending 间切换 |
| POST | `/api/sources/[id]/extract` | 入队抽取（已有运行中的 job 返回 409）；返回 job |
| GET | `/api/jobs/[id]` | `{ status, stage, progressDone, progressTotal, error }`，前端每 2 秒轮询 |
| POST | `/api/jobs/[id]/cancel` | 取消 |

### 方法论

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/methodologies` | 查询参数 `status, tagId, sourceId, q`；列表项含 name、status、tags、来源资料、步骤数、推断/未匹配摘录数量、version |
| POST | `/api/methodologies` | 手动新建空白 draft（带 1 个空步骤骨架） |
| GET | `/api/methodologies/[id]` | 完整 DTO（含 body、tags、originChunks 标题） |
| PUT | `/api/methodologies/[id]` | `{ name, tags: string[], body }`；body 与 `MethodologyBody` 同形，但节点 id 可省略（服务端补 id）、文本允许为空（保存宽松，编辑中的 draft 也能保存）；已确认的方法论保存前须通过确认校验（400），保存后 version+1；已归档的返回 409；新增标签名自动建标签 |
| POST | `/api/methodologies/[id]/confirm` / `unconfirm` / `archive` / `restore` | 状态迁移 |
| POST | `/api/methodologies/[id]/split` | `{ stepIds: string[] }` → 新 draft |
| POST | `/api/methodologies/merge` | `{ ids: string[] (≥2, 均为 draft) }` → 新 draft |
| GET | `/api/merge-suggestions` | `?sourceId&status=open` |
| POST | `/api/merge-suggestions/[id]/accept` / `dismiss` | accept 执行合并（任一成员已不是 draft 则 409） |
| GET | `/api/tags` | 全部标签及使用数量 |

### 练习与复盘

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/practice` | `{ mode, selection: 'pick' \| 'random', methodologyId?, scope: Scope, difficulty }` → `{ sessionId }` |
| GET | `/api/sessions` | 历史列表：时间、场景标题、模式、难度、状态、执行分、识别结果、说服结果；`?page&pageSize`（默认 1 / `HISTORY_PAGE_SIZE`），按创建时间倒序，返回 `{ items, page, pageSize, total }`。综合测验在复盘前不下发所用方法论名称（页面显示"—"） |
| GET | `/api/sessions/[id]` | 会话 DTO（严格遵守 `data-model.md` §4） |
| POST | `/api/sessions/[id]/select` | quiz 选择方法论 |
| POST | `/api/sessions/[id]/start` | 开始 |
| POST | `/api/sessions/[id]/hint` | drill 查看提示 |
| POST | `/api/sessions/[id]/messages` | `{ content: string (1–1000 字) }` |
| POST | `/api/sessions/[id]/regenerate` | 重试生成对方回复 |
| POST | `/api/sessions/[id]/end` | 手动结束 |
| POST | `/api/sessions/[id]/debrief` | 生成复盘（同步，可能 30–120 秒），返回 `DebriefDto`；同一场练习并发触发时复用同一次调用；已复盘 409 |
| GET | `/api/sessions/[id]/debrief` | 复盘 DTO：识别、执行分与明细、整体印象分、说服结果、总结、按步骤分组的要点判定、原则判定、完整对话、目标/所选方法论快照、场景隐藏字段 |
| PUT | `/api/verdicts/[id]/override` | `{ verdict, quality: number \| null, reason: string (必填) }`；质量分规则同 `algorithms.md` §5.1（不合规 400）→ 返回 `{ verdict: VerdictDto, executionScore, scoreBreakdown }` |
| DELETE | `/api/verdicts/[id]/override` | 撤销改判（没有改判时 409），返回同上 |
| POST | `/api/scenarios/[id]/retry` | 重练：以同一场景新建一场 briefing 练习，返回 `{ sessionId }`；body 可省略，`{ mode? }` 指定模式，省略时沿用该场景上一次练习的模式（无历史时默认 drill）；场景不存在 404 |

### 统计

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stats/overview` | `?tagId&sourceId`，见 `algorithms.md` §9.1 |
| GET | `/api/stats/confusion` | §9.2 |
| GET | `/api/stats/difficulty` | §9.3 |

## 4. 页面

整体布局：左侧导航（首页、资料、方法论库、开始练习、历史、统计、设置），内容区最大宽度约 1100px。空状态都要有下一步引导（例如方法论库为空时引导去导入资料）。

### 4.1 首页 `/`

- 未配置 AI 时顶部横幅引导去设置页。
- 两个快捷入口："专项练习"、"综合测验"（跳到 `/practice/new?mode=...`）。
- "最需要练习"：掌握度最低的 3 个方法论，每个带"专项练习"按钮（pick 模式直接创建）。
- 最近 5 场练习（`HOME_RECENT_SESSIONS`）：时间、场景标题、模式、难度、执行分、状态；"查看全部历史"跳到 `/history`。

### 4.2 设置 `/settings`

- AI 模型：Base URL、API Key（密码框，显示掩码，留空表示不修改）、模型名；"保存"、"测试连接"（显示延迟、是否支持 JSON 模式与 temperature、示例回复）。
- 练习：轮数上限。
- 提示：数据存放目录、API Key 以明文存在本机数据库。

### 4.3 资料 `/sources`、`/sources/[id]`

- 列表页：上传区（拖拽或点击，限 epub/pdf/txt/md），资料卡片。
- 详情页：
  - 头部：标题、作者、格式、字数、状态、预估 token；按钮"开始抽取"（先弹确认框，展示章节数与预估 token）、"取消"、"重试失败章节"。
  - 进度条（轮询 job）：阶段文字"抽取章节 12/40"→"去重中"→"合并中"→"完成"。
  - 章节块表格：序号、标题、字数、状态（失败显示错误）、跳过开关；点击标题在侧栏查看正文。
  - "本资料的候选方法论"列表与"合并建议"列表（接受/忽略）。

### 4.4 方法论库 `/library`

- 标签页：候选（draft）/ 已确认 / 已归档；筛选：资料、标签；搜索名称。
- 列表项：名称、标签、来源、步骤数、"N 处 AI 推断"、"N 处摘录未匹配"、状态。
- 多选 draft → "合并"；右上角"新建方法论"。

### 4.5 方法论编辑 `/library/[id]`

- 顶部：名称、标签（可新建的多选框）、状态徽章、操作按钮（保存、确认入库 / 退回候选、归档 / 恢复、拆分）。
- 分区表单（react-hook-form + useFieldArray）：
  - 概要：summary、goal。
  - 适用条件、反例：可增删的条目列表。
  - 步骤：卡片列表，上移/下移按钮排序（不引入拖拽库）；每张卡片包含标题、说明、"条件步骤"开关 + 触发条件、要点列表、示例话术列表、常见错误列表。
  - 顺序模式：严格顺序 / 顺序不敏感。
  - 原则：列表，每条选择"要做"或"禁忌"。
  - 概念：名称、解释、关联步骤（多选）。
- 每个带摘录的节点旁显示核对徽章（`algorithms.md` §3），点击后右侧抽屉打开对应章节块正文并高亮、滚动到摘录位置。
- 拆分模式：步骤卡片出现复选框，选好后点"拆分为新方法论"。
- 确认入库失败时，在表单顶部列出所有校验问题，并定位到对应字段。
- 离开页面前有未保存修改时提示。

### 4.6 方法论对比 `/library/compare?a=&b=`

两列并排：名称、适用条件、反例、步骤标题（条件步骤带标记）、原则。用于识别混淆的复习。

### 4.7 新建练习 `/practice/new`

分步表单（同一页面）：

1. 模式：专项练习 / 综合测验（附一句说明）。
2. 选题：
   - 专项练习：指定（搜索选择 1 个已确认方法论）/ 随机（设置范围）。
   - 综合测验：设置范围（按标签、资料、或勾选具体方法论；默认整个方法论库），提示"至少包含 2 个已确认方法论"，实时显示范围内数量。
3. 难度：配合 / 一般 / 强硬（附说明）。
4. "生成场景"：加载态文案"正在设计场景……"，成功后跳转 `/practice/[sessionId]`。

### 4.8 练习 `/practice/[sessionId]`

- **briefing**：场景卡（标题、背景、你的角色、你的目标、对方是谁、难度）。
  - 专项练习：显示目标方法论名称，"查看方法论骨架"按钮（点击即记录查看提示，按钮旁注明"查看后会在统计中标记"）。
  - 综合测验：候选方法论单选列表（只显示名称和标签），未选择时"开始"按钮禁用。
  - "开始对话"。
- **active**：
  - 顶部：场景标题、"第 n / 12 轮"、"结束练习"按钮（二次确认）。
  - 左侧可折叠的场景卡；专项练习右侧有可展开的骨架抽屉。
  - 对话区：对方消息在左、用户消息在右；等待回复时显示"对方正在输入……"；失败时在最后一条用户消息下显示"生成失败，重试"。
  - 输入框：Enter 发送，Shift+Enter 换行，发送中禁用。
- **ended**：显示结束原因（"对方：{endNote}" / "已到达轮数上限" / "你结束了练习"），自动调用复盘接口，显示加载态"正在复盘……（约 30–120 秒）"，完成后跳转复盘页；失败显示"重试复盘"。

### 4.9 复盘 `/practice/[sessionId]/debrief`

布局：左侧主栏为评判结果，右侧为完整对话（可折叠），点击证据时对话滚动到该轮并高亮引用片段。

1. **头部**：执行分（大号）；整体印象分（小号，注明"AI 整体印象，仅供参考，不计入统计"）；说服结果与说明；模式、难度、是否查看过提示。
2. **识别**（仅综合测验）：你选择的 / 目标方法论 / 备选方法论；结果徽章（正确 / 部分正确 / 错误）；AI 解释；场景设计说明（designNotes）；错误时显示"对比两者"链接。
3. **总结**：做得好的地方、最重要的改进点。
4. **扣分项**：违反的原则、错序（"『用数据陈述贡献』出现在『预约时机』之前"）。
5. **步骤与要点**：按步骤分组；未触发的条件步骤折叠显示"本场未触发"。每个要点卡片包含：
   - 判定徽章、质量分（1–5 星）、点评、证据引用（可点击）、建议。
   - 降级提示："AI 认为做到了，但没能在你的原话中找到对应内容，已按未做到处理"。
   - 示范改写："你当时说"与"可以这样说"对照，附相关概念解释。
   - "改判"按钮 → 弹窗（判定、质量分、理由必填）→ 保存后执行分即时刷新；已改判的卡片显示"已改判"标记、理由与撤销按钮。
6. **原则**：遵守 / 违反列表，违反的附证据。
7. 底部操作："再练一次"（同一场景）、"换个场景练同一方法论"（drill + pick）、"返回首页"。

### 4.10 历史 `/history`

表格：时间、场景标题、模式、难度、所用方法论（quiz 复盘前显示"—"）、执行分、识别、说服结果、状态。操作：查看复盘 / 继续（未结束的会话）/ 再练一次。按创建时间倒序分页，每页 `HISTORY_PAGE_SIZE` 场，`?page=` 指定页码。

### 4.11 统计 `/stats`

顶部筛选：标签、资料。三个标签页：

1. **方法论概览**：表格（`algorithms.md` §9.1 字段），执行分趋势以迷你折线展示；点击行展开大图（折线点按难度着色，查看过提示的点用空心表示）。
2. **识别混淆**：列表"目标 X → 误选 Y：错误 n 次 / 部分正确 m 次"，每行"对比"链接；数据为空时说明"完成综合测验后这里会显示你容易混淆的方法论"。
3. **难度分层**：总体三档柱状图（执行分均值 + 说服结果分布）；按方法论表格（三档均值，差值最大者高亮）。
