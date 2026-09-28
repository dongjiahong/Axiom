# 数据模型

## 1. 约定

- 主键：`text`，nanoid（21 位）。方法论内部节点（步骤、要点等）的 ID 也用 nanoid，由**代码**生成，不让 AI 生成。
- 时间：`integer`，Unix 毫秒。
- JSON 列：`text` 存 JSON 字符串，Drizzle 用 `text({ mode: 'json' }).$type<T>()`；读写时都用 Zod 校验。
- 所有外键开启 `PRAGMA foreign_keys = ON`；数据库启用 WAL。
- 布尔：`integer({ mode: 'boolean' })`。

## 2. 领域模型（`src/domain/schemas.ts`）

方法论正文存为**一个 JSON 文档**，节点带稳定 ID（见 ADR-0007）。

```ts
import { z } from 'zod';

export const ExcerptMatch = z.enum(['exact', 'fuzzy', 'none']);

export const SourceExcerpt = z.object({
  text: z.string(),                 // 核对成功时替换为资料中的真实原文片段
  chunkId: z.string().nullable(),   // 命中的 SourceChunk；未命中为 null
  match: ExcerptMatch,
});

const nodeBase = {
  id: z.string(),
  excerpt: SourceExcerpt.nullable(), // inferred=true 时必须为 null
  inferred: z.boolean(),             // 原文未明说、AI 推断补全
};

export const Item = z.object({ ...nodeBase, text: z.string().min(1) });

export const KeyPoint = z.object({ ...nodeBase, text: z.string().min(1) });

export const Step = z.object({
  ...nodeBase,
  title: z.string().min(1),
  description: z.string(),
  conditional: z.boolean(),
  trigger: z.string().nullable(),      // conditional=true 时必填，如"对方以预算为由拒绝"
  keyPoints: z.array(KeyPoint).min(1),
  exampleLines: z.array(z.string()),   // 示例话术
  commonMistakes: z.array(z.string()),
});

export const Principle = z.object({
  ...nodeBase,
  kind: z.enum(['do', 'dont']),
  text: z.string().min(1),
});

export const Concept = z.object({
  ...nodeBase,
  name: z.string().min(1),
  explanation: z.string(),
  relatedStepIds: z.array(z.string()),
});

export const MethodologyBody = z.object({
  summary: z.string(),
  goal: z.string(),
  applicability: z.array(Item),
  counterIndications: z.array(Item),
  orderMode: z.enum(['strict', 'loose']),
  steps: z.array(Step).min(1),
  principles: z.array(Principle),
  concepts: z.array(Concept),
});
export type MethodologyBody = z.infer<typeof MethodologyBody>;

export const MethodologySnapshot = z.object({
  methodologyId: z.string(),
  version: z.number().int(),
  name: z.string(),
  tags: z.array(z.string()),          // 标签名
  body: MethodologyBody,
});

export const Difficulty = z.enum(['cooperative', 'neutral', 'tough']);
export const PracticeMode = z.enum(['drill', 'quiz']);
export const SelectionMode = z.enum(['pick', 'random']);

export const Scope = z.object({       // 选题范围；三者取并集，全空 = 整个方法论库
  tagIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  methodologyIds: z.array(z.string()),
});

export const PlannedResistance = z.object({
  id: z.string(),                      // 代码分配：r1, r2...
  trigger: z.string(),                 // 用户做了/没做什么时触发
  reaction: z.string(),                // 对方如何反应
  linkedStepId: z.string().nullable(), // 用于触发哪个条件步骤
});

export const CounterpartBrief = z.object({
  personality: z.string(),
  trueStance: z.string(),
  hiddenConcerns: z.array(z.string()),
  plannedResistance: z.array(PlannedResistance),
  yieldConditions: z.string(),         // 满足什么才让步
  breakdownConditions: z.string(),     // 什么情况会谈崩
});

export const Alternative = z.object({ methodologyId: z.string(), reason: z.string() });

export const Evidence = z.object({
  turn: z.number().int().min(1),
  quote: z.string(),                   // 核对成功时替换为用户真实原话片段
  match: ExcerptMatch,
});

export const KeyPointVerdictValue = z.enum(['done', 'partial', 'missed', 'not_triggered']);
export const PrincipleVerdictValue = z.enum(['kept', 'violated']);
export const Recognition = z.enum(['correct', 'partial', 'wrong']);
export const Outcome = z.enum(['agreed', 'partial', 'refused', 'unresolved']);

export const ModelRewrite = z.object({
  turn: z.number().int().min(1),
  original: z.string(),                // 用户该轮原话；missed 且无对应原话时可为空串
  rewrite: z.string(),
  conceptIds: z.array(z.string()),
});

export const EndReason = z.enum(['user', 'agreed', 'broke_down', 'closed', 'turn_limit']);
```

## 3. 数据库表（`src/server/db/schema.ts`）

### settings

| 列 | 类型 | 说明 |
| --- | --- | --- |
| key | text PK | `llm`、`practice` |
| value | text(json) | 见下 |
| updatedAt | int | |

- `llm`：`{ baseUrl, apiKey, model, supportsJsonMode: boolean \| null, supportsTemperature: boolean \| null, testedAt: number \| null }`
- `practice`：`{ maxTurns: number }`
- 环境变量 `AXIOM_LLM_BASE_URL / AXIOM_LLM_API_KEY / AXIOM_LLM_MODEL` 存在时覆盖数据库值（设置页提示"已被环境变量覆盖"）。
- API Key 明文存本地数据库（本地单用户，接受）；任何接口只返回掩码（`sk-****abcd`）。

### sources

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| title | text | 从元数据取，取不到用文件名 |
| author | text null | |
| format | text | `epub \| pdf \| txt \| md` |
| originalFilename | text | |
| filePath | text | `data/uploads/<id>.<ext>` |
| charCount | int | 全文字数 |
| status | text | `parsing \| ready \| extracting \| extracted \| failed` |
| error | text null | |
| createdAt / updatedAt | int | |

### source_chunks

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| sourceId | text FK → sources（cascade） | |
| seq | int | 顺序，unique(sourceId, seq) |
| title | text | 章节标题；切分块为"标题（2/3）" |
| text | text | 纯文本 |
| charCount | int | |
| extractionStatus | text | `pending \| running \| done \| failed \| skipped` |
| extractionError | text null | |
| extractedAt | int null | |

### jobs

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| type | text | MVP 仅 `extract_source` |
| payload | text(json) | `{ sourceId }` |
| status | text | `queued \| running \| succeeded \| failed \| cancelled` |
| stage | text null | `chunks \| cluster \| merge \| done` |
| progressDone / progressTotal | int | |
| error | text null | |
| createdAt / startedAt / finishedAt | int / null / null | |

### methodologies

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| sourceId | text null FK → sources（set null） | 手动新建为 null |
| status | text | `draft \| confirmed \| archived` |
| name | text | |
| body | text(json) `MethodologyBody` | |
| originChunkIds | text(json) `string[]` | 来源章节块 |
| createdBy | text | `extraction \| merge \| split \| manual \| seed` |
| mergedIntoId | text null | 因合并被归档时指向合并结果 |
| version | int default 1 | 已确认后每次保存 +1 |
| createdAt / updatedAt | int | |
| confirmedAt | int null | |

删除资料时：该资料的 draft 方法论一并删除；confirmed/archived 的保留（`sourceId` 置空），因为历史练习引用它们。

### tags / methodology_tags

- `tags(id PK, name unique)`
- `methodology_tags(methodologyId FK cascade, tagId FK cascade, PK(methodologyId, tagId))`

### merge_suggestions

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| sourceId | text FK cascade | |
| methodologyIds | text(json) `string[]` | ≥2 |
| reason | text | |
| status | text | `open \| accepted \| dismissed` |
| createdAt | int | |

### scenarios

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| targetMethodologyId | text FK → methodologies | |
| targetVersion | int | 生成时目标方法论的版本 |
| difficulty | text | |
| scope | text(json) `Scope` | 生成时的选题范围 |
| candidateIds | text(json) `string[]` | 综合测验：候选列表（范围内全部已确认方法论，含目标与备选）；专项练习：`[targetId]` |
| title / background / userRole / userGoal | text | **可见字段** |
| counterpartName / counterpartRelation / counterpartProfile | text | **可见字段**（公开人设） |
| openingSpeaker | text | `counterpart \| user` |
| openingLine | text null | openingSpeaker=counterpart 时必填 |
| brief | text(json) `CounterpartBrief` | **隐藏** |
| alternatives | text(json) `Alternative[]` | **隐藏**（复盘前） |
| designNotes | text | **隐藏**（复盘前）：为何目标方法论最合适 |
| promptVersion | text | |
| createdAt | int | |

### practice_sessions

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| scenarioId | text FK | |
| mode | text | `drill \| quiz` |
| status | text | `briefing \| active \| ended \| debriefed \| debrief_failed` |
| selectedMethodologyId | text null | drill 创建时 = 目标；quiz 由用户在 briefing 阶段选择 |
| targetSnapshot | text(json) `MethodologySnapshot` null | start 时写入 |
| selectedSnapshot | text(json) `MethodologySnapshot` null | start 时写入；与目标相同时也写一份，便于统一处理 |
| hintUsed | bool default false | |
| maxTurns | int | 创建时从设置复制 |
| endReason | text null | `EndReason` |
| endNote | text null | 对方收尾时的说明 |
| createdAt / startedAt / endedAt | int / null / null | |

### messages

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| sessionId | text FK cascade | |
| seq | int | unique(sessionId, seq) |
| role | text | `user \| counterpart` |
| turn | int | 用户第 k 条消息 turn=k；其后对方回复 turn=k；开场白 turn=0 |
| content | text | |
| meta | text(json) null | 对方消息：`{ firedResistanceIds: string[], end: {type, note} \| null }` |
| createdAt | int | |

### debriefs

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| sessionId | text unique FK cascade | |
| recognition | text null | quiz 才有，代码计算 |
| recognitionExplanation | text null | AI 撰写 |
| executionScore | int | 代码计算；改判后重算 |
| scoreBreakdown | text(json) | 见 `algorithms.md` §5 输出结构 |
| holisticScore | int | AI 给出，仅展示 |
| holisticComment | text | |
| outcome | text | `Outcome` |
| outcomeNote | text | |
| summary | text(json) | `{ strengths: string[], improvements: string[] }` |
| promptVersion | text | |
| createdAt / updatedAt | int | |

### verdicts

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| debriefId | text FK cascade | |
| kind | text | `key_point \| principle` |
| stepId | text null | kind=key_point 时 |
| refId | text | keyPointId 或 principleId（指向 selectedSnapshot 内的节点） |
| aiVerdict | text | AI 原始判定（经一致性修正后） |
| aiQuality | int null | 1–5；missed/not_triggered/原则为 null |
| verdict | text | 证据核对后的判定（可能被降级） |
| quality | int null | 同上 |
| evidenceDowngraded | bool | 因证据核对失败被降级 |
| comment | text | |
| suggestion | text null | |
| evidence | text(json) `Evidence[]` | |
| rewrite | text(json) `ModelRewrite` null | |
| overrideVerdict | text null | 改判 |
| overrideQuality | int null | |
| overrideReason | text null | 改判必填 |
| overriddenAt | int null | |

**生效判定** = `overrideVerdict ?? verdict`，**生效质量分** = 有改判时取 `overrideQuality`，否则取 `quality`。评分与统计只用生效值。

### llm_calls（调试与成本观察）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| task | text | `extract_chunk \| cluster \| merge \| scenario \| counterpart \| debrief \| test` |
| refType / refId | text null | 关联实体 |
| model | text | |
| attempt | int | JSON 修复重试序号 |
| status | text | `ok \| transport_error \| invalid_output` |
| durationMs | int | |
| promptTokens / completionTokens | int null | |
| requestMessages | text | 截断至 200KB；不得包含 API Key |
| responseText | text null | 截断至 200KB |
| error | text null | |
| createdAt | int | |

## 4. 隐藏字段下发规则（强制，必须有测试）

所有客户端数据经 `src/server/dto/*` 映射，**绝不**直接返回数据库行。

| 数据 | briefing / active / ended | debriefed / debrief_failed |
| --- | --- | --- |
| scenario 可见字段 | 下发 | 下发 |
| `brief`、`designNotes`、`alternatives` | **不下发** | 下发 |
| `targetMethodologyId`、目标方法论名称 | drill：下发；quiz：**不下发** | 下发 |
| quiz 候选列表 | 只下发 `{ id, name, tags }`，**不下发** summary / applicability 等正文 | 下发 |
| drill 方法论骨架 | 仅在请求 `/hint` 后下发（并置 `hintUsed=true`） | 下发 |
| messages.meta | **不下发** | 下发 |

候选列表按名称排序下发，不得让目标方法论的位置泄露答案（例如总排在第一个）。

测试要求：对 quiz 会话在 briefing/active 状态调用 `GET /api/sessions/[id]`，断言：响应中没有 `targetMethodologyId`、`alternatives`、`designNotes`、`brief` 这些键；`brief` 中任意字段的值都不出现在序列化后的响应里；候选列表按名称排序。
