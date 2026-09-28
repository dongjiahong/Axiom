# AI 调用层与提示词

## 1. 设计要点

- 只有一个 OpenAI 兼容端点和一个模型（ADR-0006）。
- 所有结构化输出都走"提示词约束 JSON → 提取 → 修复 → Zod 校验 → 语义校验 → 失败带错误信息重试"，不依赖端点是否支持 `json_schema`。端点支持 `response_format: { type: 'json_object' }` 时顺带开启，作为加分项。
- 每类 AI 调用定义为一个**任务**（`TaskDef`），集中在 `src/server/prompts/*.ts`；service 只调用 `runTask(def, input)`。
- 提示词中实体用**短引用**（`s1`、`k3`、`p2`、`c1`、`m4`），而不是 nanoid。代码负责建立"短引用 ↔ 真实 ID"的映射。这样省 token，也避免模型抄错长 ID。
- `AXIOM_FAKE_LLM=1` 时所有任务返回确定性的假数据，无需 API Key 就能开发 UI、跑 E2E。

## 2. 客户端（`src/server/llm/client.ts`）

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LLMClient {
  complete(req: {
    messages: ChatMessage[];
    temperature: number;
    json: boolean;          // 希望输出 JSON
    signal?: AbortSignal;
  }): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null }>;
}
```

`OpenAICompatClient` 实现要点：

- `new OpenAI({ baseURL, apiKey, timeout: LLM_TIMEOUT_MS, maxRetries: LLM_TRANSPORT_RETRIES })`，由 SDK 负责 429/5xx/网络错误的退避重试。
- `chat.completions.create({ model, messages, temperature?, response_format? })`
  - 仅当 `settings.supportsTemperature !== false` 时发送 `temperature`。
  - 仅当 `json && settings.supportsJsonMode === true` 时发送 `response_format: { type: 'json_object' }`。
  - 不发送 `max_tokens`（不同端点参数名不一致，且长输出任务不应被截断）。
- 若返回 `finish_reason === 'length'`，抛出 `LLMTruncatedError`，由 `runTask` 当作一次无效输出处理并在修正提示里要求"更精简"。
- 设置读取：`getLLMSettings()`，环境变量优先于数据库；未配置时抛 `LLMNotConfiguredError`，接口层返回 409 与中文提示"请先在设置页配置 AI 模型"。

### 测试连接（`POST /api/settings/llm/test`）

依次执行并把结果写回 `settings.llm`：

1. 带 `temperature: 0.2` 发一条"请只回复：好"。若返回 400 且错误信息包含 `temperature`，改为不带 temperature 重试，记 `supportsTemperature=false`；否则记 `true`。
2. 带 `response_format: json_object` 发"请输出 JSON：{\"ok\": true}"。成功且能解析记 `supportsJsonMode=true`；返回 400 记 `false`。
3. 返回 `{ ok, latencyMs, supportsJsonMode, supportsTemperature, sample }` 给前端展示。

## 3. 任务框架（`src/server/llm/run-task.ts`）

```ts
export type TaskName = 'extract_chunk' | 'cluster' | 'merge' | 'scenario' | 'counterpart' | 'debrief';

export interface TaskDef<I, O> {
  name: TaskName;
  promptVersion: string;                       // 如 'extract_chunk@1'，修改提示词时递增
  temperature: number;
  schema: z.ZodType<O>;                        // AI 输出结构（短引用形式）
  build(input: I): ChatMessage[];
  validate?(output: O, input: I): string[];    // 语义校验，返回中文错误列表；空数组表示通过
  fake(input: I): O;                           // Fake 模式输出，必须能通过 schema 与 validate
}

export async function runTask<I, O>(
  def: TaskDef<I, O>,
  input: I,
  ctx?: { refType?: string; refId?: string; signal?: AbortSignal },
): Promise<O>;
```

流程：

```
if FAKE: out = def.fake(input); 断言 schema + validate 通过; 返回
messages = def.build(input)
for attempt in 1..LLM_JSON_ATTEMPTS:
    text = client.complete({ messages, temperature: def.temperature, json: true })
    记录 llm_calls
    parsed = extractJson(text)            // 见下
    errors = parsed 失败 ? ['输出不是合法 JSON'] :
             schema.safeParse 失败 ? zod 错误转中文路径描述 :
             def.validate?.(data, input) ?? []
    if errors 为空: return data
    messages += [{ role:'assistant', content:text },
                 { role:'user', content: correctionPrompt(errors) }]
throw new LLMOutputError(def.name, lastErrors)
```

`extractJson(text)`（`src/server/llm/json.ts`）：

1. 删除 `<think>...</think>`、`<thinking>...</thinking>` 块（兼容推理模型）。
2. 若存在 ```` ```json ... ``` ```` 或 ```` ``` ... ``` ```` 代码块，取第一个代码块内容。
3. 否则截取第一个 `{` 到与之配对的最后一个 `}`。
4. `JSON.parse`；失败则用 `jsonrepair` 修复后再 parse；仍失败返回错误。

`correctionPrompt(errors)`：

```
你上一次的输出不符合要求：
- {error1}
- {error2}
请修正后重新输出完整的 JSON 对象。只输出 JSON，不要任何解释或代码块标记。
```

Zod 错误转中文：`路径 keyPointVerdicts[3].quality：应为 1–5 的整数`，路径用短引用形式便于模型定位。

## 4. 通用提示词片段（`src/server/prompts/common.ts`）

```
【输出格式】
只输出一个 JSON 对象，不要使用 Markdown 代码块，不要输出任何解释。
所有面向用户的文字使用简体中文。
JSON 结构如下（`?` 表示可为 null）：
{schemaDescription}
```

每个任务手写一份 `schemaDescription`（TypeScript 风格的结构说明）。**测试必须覆盖**：每个任务的 `fake()` 输出能通过 `schema` 与 `validate`，以此保证描述与 Zod 同步演进时不会被遗忘（修改 schema 时同时修改描述与 fake）。

## 5. 任务一：章节抽取 `extract_chunk`

- 温度：0.2
- 输入：`{ sourceTitle, author, chunkTitle, chunkText, existingTags: string[] }`
- 输出 schema：

```ts
const AiNode = { excerpt: z.string().nullable(), inferred: z.boolean() };
const AiItem = z.object({ text: z.string().min(1), ...AiNode });
const AiStep = z.object({
  title: z.string().min(1), description: z.string(),
  conditional: z.boolean(), trigger: z.string().nullable(),
  keyPoints: z.array(AiItem).min(1).max(4),
  exampleLines: z.array(z.string()), commonMistakes: z.array(z.string()),
  ...AiNode,
});
const AiPrinciple = z.object({ kind: z.enum(['do','dont']), text: z.string().min(1), ...AiNode });
const AiConcept = z.object({ name: z.string(), explanation: z.string(), relatedStepIndexes: z.array(z.number().int()), ...AiNode });
export const AiMethodology = z.object({
  name: z.string().min(1), summary: z.string(), goal: z.string(),
  applicability: z.array(AiItem).min(1), counterIndications: z.array(AiItem),
  orderMode: z.enum(['strict','loose']),
  steps: z.array(AiStep).min(1), principles: z.array(AiPrinciple), concepts: z.array(AiConcept),
  suggestedTags: z.array(z.string()).min(1).max(3),
});
export const ExtractChunkOutput = z.object({ methodologies: z.array(AiMethodology) });
```

- 语义校验：`conditional=true` 必须有 `trigger`；`inferred=true` 时 `excerpt` 必须为 null；`relatedStepIndexes` 在范围内；至少一个非条件步骤。
- 代码后处理：分配 nanoid；对每个非推断节点的 `excerpt` 在本章节块中做文本核对（`algorithms.md` §3），得到 `SourceExcerpt`；标签归一化（去空格、合并同名）。

系统提示词：

```
你是一名沟通方法论整理专家。你的任务是从一本书的某个章节中，抽取"可执行的沟通方法论"，整理成结构化骨架，供用户后续做情景练习。

【什么算方法论】
- 针对某一类具体沟通情境（如向领导提加薪、安慰情绪低落的伴侣、拒绝同事的额外请求），给出了可以照着做的步骤或做法。
- 纯粹的故事、观点、理论阐述、心态鼓励，如果没有可执行的做法，不要抽取。
- 本章没有方法论时，返回 {"methodologies": []}。不要为了有输出而编造。
- 同一章节中针对不同情境的做法，拆成不同的方法论。

【字段要求】
- name：简短、具体，体现情境，如"向领导提加薪"、"先共情再建议的安慰法"。
- summary：一两句话概括。goal：使用该方法要达成的沟通结果。
- applicability：适用条件，描述情境特征（关系、时机、对方状态、前提），不写做法。
- counterIndications：不适用的情境特征。
- steps：按原文顺序列出。每个步骤 1–4 个要点（keyPoints）。
  - 要点必须"可观察、可评判"：描述在对话中说了/做了什么，例如"用具体数字说明过去一年的成果"；不要写"保持自信"这类无法从对话中判断的描述。
  - conditional：只有当对方出现特定反应时才需要执行的步骤（如"对方拒绝时，询问达到加薪需要满足的条件与时间"），设为 true，并在 trigger 中写明触发的对方反应。
  - exampleLines：原文中的示例话术，或贴合原文的示例；commonMistakes：常见错误。
- orderMode：原文明确强调先后顺序（如"先……再……最后……"）为 "strict"，否则为 "loose"。
- principles：贯穿全程、不分先后的要求（kind="do"）或禁忌（kind="dont"）。
- concepts：支撑该方法的原理或术语（如"锚定效应"），relatedStepIndexes 为相关步骤的下标（从 0 开始）。
- suggestedTags：1–3 个生活领域标签，优先从已有标签中选择：{existingTags}；没有合适的再新建，标签用 2–4 个字。

【忠于原文】
- excerpt 必须是从章节原文中**逐字复制**的连续片段，10–120 字，不得改写、拼接、省略；原文是英文则保留英文。
- 原文没有明说、但为了骨架完整而补充的内容（常见于 applicability、counterIndications、principles），设 inferred=true 且 excerpt=null。
- 除 excerpt 外，所有字段用简体中文书写；原文为外文时翻译为中文。

{输出格式片段}
```

用户消息：

```
书名：{sourceTitle}　作者：{author ?? '未知'}
章节：{chunkTitle}
<chapter>
{chunkText}
</chapter>
```

## 6. 任务二：去重聚类 `cluster`

- 温度：0.1
- 仅在同一资料内部聚类（跨书的相似方法论不合并，它们在综合测验里会成为备选方法论）。
- 输入：`{ items: { ref: 'm1'..., name, summary, stepTitles: string[], chunkTitle }[] }`
- 输出：`{ groups: { refs: string[] (≥2), confidence: 'high' | 'medium', reason: string }[] }`
- 语义校验：ref 必须存在；每个 ref 至多出现在一个组；组内至少 2 个。
- 条目超过 150 个时按原顺序分批（每批 150，相邻批次重叠 20 个），合并结果时对有交集的组做并集。

系统提示词：

```
下面是从同一本书不同章节抽取出的候选沟通方法论。请找出**描述的是同一个方法论**的条目（同一类情境，且核心步骤大体相同，只是在不同章节被重复讲述或补充）。

- confidence="high"：几乎可以确定是同一方法，合并不会丢失差异。
- confidence="medium"：很可能相同，但情境或步骤有值得用户确认的差异。
- 只是主题相近、但适用情境或核心做法不同的，不要分到一组。
- 没有重复就返回 {"groups": []}。
- reason 用一句话说明为什么认为它们相同（medium 时说明差异点）。

{输出格式片段}
```

## 7. 任务三：合并 `merge`

- 温度：0.2
- 输入：`{ drafts: AiMethodologyLike[] }`（去掉 ID，保留全部文本与 excerpt 原文）
- 输出：`AiMethodology`（与抽取任务同一结构）
- 代码后处理：新节点分配 nanoid；excerpt 在**所有来源章节块的并集**中重新核对；`originChunkIds` 取并集；标签取并集。
- 触发方：抽取流水线中的高置信组（自动），以及用户在方法论库中手动选择 ≥2 个候选方法论合并、或接受合并建议。

系统提示词：

```
下面是被判定为同一沟通方法论的多个版本。请把它们合并为一个完整、不重复的方法论骨架。

- 取并集：保留所有不重复的步骤、要点、原则、概念、示例话术与常见错误；意思相同的只保留表述更具体的一条。
- 步骤顺序以最完整的版本为准；orderMode 任一版本为 strict 则为 strict。
- excerpt 只能从输入中已有的 excerpt 原样复制，不得新造；inferred 标记保持与来源一致。
- name 选最能体现情境的一个，必要时重写得更具体。

{输出格式片段}
```

## 8. 任务四：场景生成 `scenario`

- 温度：0.9
- 输入：

```ts
{
  mode: 'drill' | 'quiz';
  difficulty: Difficulty;
  target: { name, summary, goal, applicability: string[], counterIndications: string[],
            steps: { ref: 's1', title, conditional, trigger }[], principles: string[] };
  others: { ref: 'm1', name, applicability: string[], counterIndications: string[] }[]; // 范围内其余已确认方法论
  recentTitles: string[];  // 该目标方法论最近 10 个场景标题，避免重复
}
```

- 输出：

```ts
z.object({
  title: z.string(), background: z.string(), userRole: z.string(), userGoal: z.string(),
  counterpart: z.object({ name: z.string(), relation: z.string(), profile: z.string() }),
  openingSpeaker: z.enum(['counterpart', 'user']),
  openingLine: z.string().nullable(),
  brief: z.object({
    personality: z.string(), trueStance: z.string(),
    hiddenConcerns: z.array(z.string()).min(1),
    plannedResistance: z.array(z.object({
      trigger: z.string(), reaction: z.string(), linkedStepRef: z.string().nullable(),
    })).min(1),
    yieldConditions: z.string(), breakdownConditions: z.string(),
  }),
  alternatives: z.array(z.object({ ref: z.string(), reason: z.string() })),
  designNotes: z.string(),
})
```

- 语义校验：
  - `openingSpeaker='counterpart'` 时 `openingLine` 非空，反之为 null。
  - `linkedStepRef` 为 null 或指向目标方法论中的**条件步骤**。
  - 难度与阻力数量：cooperative 1–2 条；neutral 2–3 条；tough 3–5 条。neutral/tough 时，每个条件步骤至少被一条阻力关联。
  - `alternatives[].ref` 必须在 `others` 中；drill 模式允许为空。
  - 可见字段（title、background、userRole、userGoal、counterpart.*、openingLine）归一化后不得包含：目标方法论名称、`others` 中任一方法论名称、目标方法论中长度 ≥4 的步骤标题。
- 代码后处理：阻力分配 ID `r1..rn`，`linkedStepRef` / `alternatives.ref` 映射回真实 ID。

系统提示词：

```
你是沟通训练的情景设计师。请根据"目标方法论"设计一个练习场景：用户将扮演场景中的"你"，与由 AI 扮演的对方进行多轮对话。

【设计原则】
1. 场景必须满足目标方法论的适用条件，且不落入它的反例。
2. {仅 quiz} 这是综合测验，用户看不到目标方法论，要自己判断该用哪个方法。请让场景特征能区分目标方法论与其他候选方法论：尽量让其他候选的适用条件不满足、或落入它们的反例。确实同样适用的候选，列入 alternatives 并说明理由；不要滥标。
3. 可见内容（title、background、userRole、userGoal、counterpart、openingLine）中不得出现任何方法论的名称、步骤名称，也不得暗示做法（如"你应该先认同对方"）。userGoal 只写想达成什么，不写怎么做。
4. background 用第二人称"你"，150–300 字，写清人物关系、事件经过、利害得失和此刻的情境，细节具体、贴近中国职场与生活。
5. 避免与这些已有场景雷同：{recentTitles}

【对方角色卡（用户看不到）】
- personality、trueStance（真实立场）、hiddenConcerns（2–4 个不会主动说出的顾虑）。
- plannedResistance：预先设计的阻力，每条写清 trigger（用户做了/没做什么时触发）与 reaction（对方怎么说、怎么做）。目标方法论的条件步骤需要对方的特定反应才会被练到，请用阻力去制造这些反应，并用 linkedStepRef 标注对应的条件步骤。
- yieldConditions：用户做到什么程度对方才会让步；breakdownConditions：什么情况下对方会拒绝到底或谈崩。

【难度：{difficulty}】
- 配合（cooperative）：对方友善开放，阻力 1–2 条且温和，用户基本按要点去做就能达成。
- 一般（neutral）：对方有自己的立场和顾虑，阻力 2–3 条，用户需要较完整地执行要点对方才会让步。
- 强硬（tough）：对方强势、忙碌或情绪化，阻力 3–5 条，会反复施压、质疑或转移话题；只有高质量执行才可能换来部分让步。

【designNotes】说明为什么目标方法论最适合这个场景{quiz: "，以及它与最容易混淆的候选方法论的区别"}。这段内容在复盘时展示给用户。

{输出格式片段}
```

用户消息：以 JSON 形式给出 `target` 与 `others`。

## 9. 任务五：对方回复 `counterpart`

- 温度：0.8
- 不向对方提供目标方法论（避免对方"配合考点"）；只提供场景、角色卡与轮次信息。
- 输入：`{ scenario（含 brief，阻力带 id）, difficulty, history: { role, content }[], turn, maxTurns }`
- 消息组装：
  - 唯一的 system 消息放在最前，每次调用重新生成，其中包含"当前轮次"段落：`本轮是第 {turn}/{maxTurns} 轮。`最后一轮时追加`这是最后一轮，请在回复中自然地收尾。`（不要在对话中间插入 system 消息，部分兼容端点不支持。）
  - 历史中对方消息作为 `assistant`（只放纯文本 reply，不放 JSON），用户消息作为 `user`。
  - 若历史以对方开场白（assistant）开头，在其前面补一条 `user` 消息"（对话开始）"，兼容要求首条非 system 消息必须是 user 的端点。
  - 历史中的 assistant 是纯文本，模型可能跟着输出纯文本。因此 system 消息末尾必须重申输出格式；若解析失败，由 `runTask` 的修正重试兜底。
- 输出：

```ts
z.object({
  reply: z.string().min(1).max(300),
  firedResistanceIds: z.array(z.string()),
  end: z.object({ type: z.enum(['agreed', 'broke_down', 'closed']), note: z.string() }).nullable(),
})
```

- 语义校验：`firedResistanceIds` 必须是已有阻力 ID。
- 结束判定（service 中）：`end` 非空 → 会话结束，`endReason = end.type`；否则若 `turn >= maxTurns` → `endReason='turn_limit'`。

系统提示词：

```
你正在一个沟通练习中扮演 {counterpart.name}（{counterpart.relation}）。与你对话的是用户扮演的"{userRole}"。

【场景】
{background}

【你的角色卡（绝不透露给对方）】
性格：{personality}
真实立场：{trueStance}
不会主动说出的顾虑：{hiddenConcerns}
计划阻力：
{r1: 当 {trigger} 时，{reaction}}
...
让步条件：{yieldConditions}
谈崩条件：{breakdownConditions}
难度：{难度说明}

【表演规则】
1. 始终以 {counterpart.name} 的身份、口吻说话，口语化，每次 1–4 句，不超过 120 字。可以用括号简短描写语气或动作，如"（皱了皱眉）"。
2. 只对用户**实际说出的话**做反应，不要替用户补全意思，不要主动帮用户解决问题。
3. 绝不跳出角色，不评价用户的沟通技巧，不提"练习""方法论""AI"。
4. 触发条件满足时，按计划阻力做出反应，并把该阻力的 id 写入 firedResistanceIds。同一条阻力可以因用户的回应不同而再次出现，但不要机械重复原话。
5. 只有满足让步条件时才让步；不要因为用户态度礼貌就轻易答应。
6. 当达成一致（agreed）、谈崩（broke_down）、或对话自然结束（closed）时，设置 end，并在 note 中用一句话说明结果；否则 end 为 null。

【当前轮次】
本轮是第 {turn}/{maxTurns} 轮。{最后一轮时：这是最后一轮，请在回复中自然地收尾。}

{输出格式片段}
（历史对话中你的发言只显示了 reply 文本，但你本次必须输出完整 JSON。）
```

## 10. 任务六：复盘 `debrief`

- 温度：0.2
- 输入：

```ts
{
  mode: 'drill' | 'quiz';
  scenario: { 可见字段 + brief + designNotes };
  selected: {                    // 用户所用（drill 即目标）方法论快照，短引用
    name, goal, orderMode,
    steps: { ref: 's1', title, description, conditional, trigger,
             keyPoints: { ref: 'k1', text }[] }[],
    principles: { ref: 'p1', kind, text }[],
    concepts: { ref: 'c1', name, explanation }[],
  };
  recognition?: {                // 仅 quiz，结果已由代码算出，AI 只负责解释
    result: Recognition;
    selectedName; selectedApplicability: string[]; selectedCounterIndications: string[];
    targetName; targetApplicability: string[];
    alternativeNames: string[];
  };
  transcript: string;            // 见下方格式
  firedResistance: { id, trigger, linkedStepTitle: string | null, turns: number[] }[];
  userTurnCount: number;
}
```

transcript 格式：

```
[第0轮·对方] ……
[第1轮·你] ……
[第1轮·对方] ……
```

- 输出：

```ts
const AiEvidence = z.object({ turn: z.number().int(), quote: z.string().min(1) });
z.object({
  keyPointVerdicts: z.array(z.object({
    ref: z.string(),
    verdict: z.enum(['done', 'partial', 'missed', 'not_triggered']),
    quality: z.number().int().min(1).max(5).nullable(),
    evidence: z.array(AiEvidence),
    comment: z.string(),
    suggestion: z.string().nullable(),
    rewrite: z.object({ turn: z.number().int(), original: z.string(), rewrite: z.string(), conceptRefs: z.array(z.string()) }).nullable(),
  })),
  principleVerdicts: z.array(z.object({
    ref: z.string(), verdict: z.enum(['kept', 'violated']), evidence: z.array(AiEvidence), comment: z.string(),
  })),
  holistic: z.object({ score: z.number().int().min(0).max(100), comment: z.string() }),
  outcome: z.object({ result: z.enum(['agreed', 'partial', 'refused', 'unresolved']), note: z.string() }),
  recognitionExplanation: z.string().nullable(),
  summary: z.object({ strengths: z.array(z.string()).max(3), improvements: z.array(z.string()).min(1).max(3) }),
})
```

- 语义校验（不通过则重试）：
  - 每个 `k` 引用恰好出现一次，每个 `p` 引用恰好出现一次，不得出现未知引用。
  - `not_triggered` 只能用于条件步骤下的要点。
  - `done/partial` 至少一条 evidence；`violated` 至少一条 evidence。
  - evidence 与 rewrite 的 `turn` 在 `1..userTurnCount` 内。
  - `partial/missed` 必须有 `rewrite`；`conceptRefs` 必须是已知概念。
  - quiz 模式 `recognitionExplanation` 非空；drill 模式为 null。
- 不作为错误、由代码修正的情况：质量分与判定不一致（按 `algorithms.md` §5.1 规则收敛）。
- 代码后处理：证据核对与降级（`algorithms.md` §4）→ 写 verdicts → 计算执行分。

系统提示词：

```
你是一位严格、具体、建设性的沟通教练。用户刚完成一场沟通练习，请依据方法论骨架逐项评判。

【评判对象】
用户所用的方法论为「{selected.name}」。请对它的**每一个要点**（k 开头的引用）和**每一条原则**（p 开头的引用）各给出一条判定，不能遗漏或重复。

【要点判定】
- done：做到了。partial：有意图但不完整或不到位。missed：该做而没做。
- not_triggered：仅用于条件步骤下的要点，且对话中从未出现该步骤的触发情形（可参考"对方阻力触发记录"与对话原文）。只要触发情形出现过而用户没有应对，就是 missed。
- quality（1–5）：5=自然、完整、时机恰当，可作示范；4=做到且较好；3=做到但生硬或不完整；2=有意图但明显不到位；1=几乎没做到。done 取 3–5，partial 取 1–3，missed 与 not_triggered 为 null。
- evidence：done 与 partial 必须引用用户原话。turn 为轮次，quote 为从该轮"你"的发言中**逐字复制**的片段（4–80 字），不能引用对方的话，不能改写。
- comment：具体说明做得怎么样，好在哪里或差在哪里，结合对话内容。
- suggestion：一句话说明下次可以怎么做（done 且 quality=5 时可为 null）。
- rewrite：partial 与 missed 必须给出。turn 为最适合改进的那一轮；original 为用户该轮原话（若该轮本就不该这样说，也照抄原话）；rewrite 为符合场景口吻、可以直接说出口的建议说法；conceptRefs 为相关概念引用（可为空）。

【原则判定】kept 或 violated；violated 必须引用原话作为 evidence。

【其他】
- holistic：0–100 的整体印象分，综合自然度、情绪把控、关系维护，并用一两句话说明。
- outcome：对方最终的态度，agreed（答应）/ partial（部分让步）/ refused（拒绝）/ unresolved（未有结论），note 一句话说明。
- 执行判定与说服结果相互独立：不要因为对方答应了就放宽判定，也不要因为对方拒绝就收紧判定。
- recognitionExplanation：{quiz: "用户在开场前选择了「{selectedName}」，本场景的目标方法论是「{targetName}」，识别结果为 {result}。请结合场景特征，解释为什么目标方法论最适合，以及用户所选方法论与场景哪里匹配、哪里不匹配（依据适用条件与反例）。"} {drill: "输出 null。"}
- summary：strengths 为 0–3 条做得好的地方；improvements 为 1–3 条最重要的改进点，最重要的放在最前面。

{输出格式片段}
```

用户消息：以分段形式给出场景（含角色卡与 designNotes）、方法论骨架（JSON）、识别信息（quiz）、对方阻力触发记录、对话原文。

## 11. Fake 模式（`src/server/llm/fake.ts` + 各任务的 `fake()`）

目标：确定性、可通过校验、能走通全流程。建议实现：

| 任务 | fake 输出 |
| --- | --- |
| extract_chunk | 章节正文 < 200 字返回空；否则返回 1 个方法论：`name = "示例方法论：" + chunkTitle`，2 个步骤（第 2 个为条件步骤），每步 2 个要点；非推断节点的 excerpt 取正文前 30 字（保证精确命中）；标签取 `existingTags[0] ?? '职场'` |
| cluster | 名称完全相同的条目归为一组，confidence=high；其他不分组 |
| merge | 以第一个草稿为基础，追加其他草稿中文本不重复的要点 |
| scenario | 固定模板（标题包含 `recentTitles.length + 1` 以区分），为每个条件步骤生成 1 条阻力，alternatives 取 `others[0]`（quiz 且存在时） |
| counterpart | `reply = "（" + name + "）我听到你说「" + 最后一条用户消息前 10 字 + "」，再说说看？"`；第 1 轮触发 r1；用户消息含"谢谢"时 `end = { type: 'agreed' }` |
| debrief | 非条件步骤的要点：前一半 done（quality 4，evidence 取第 1 轮用户原话前 10 字），后一半 missed（附 rewrite）；条件步骤要点 not_triggered；原则全部 kept；holistic 70；outcome unresolved |
