# 算法与规则

本文件中的规则都是**确定性的**，全部放在 `src/domain/*`（解析放在 `src/server/parsing/*`），必须有单元测试。常量见 `src/domain/constants.ts`。

## 1. 资料解析（`src/server/parsing/*`）

统一输出：

```ts
interface ParsedSource {
  title: string; author: string | null;
  sections: { title: string; text: string }[];   // 按阅读顺序，尚未做大小调整
}
```

### 1.1 格式识别（`detect.ts`）

按扩展名判断，再用魔数校验：epub/zip 以 `PK\x03\x04` 开头，pdf 以 `%PDF` 开头。不一致时报错"文件内容与扩展名不符"。上传大小上限 50MB。

### 1.2 epub（`epub.ts`）

1. jszip 读取 → `META-INF/container.xml` 找到 OPF 路径。
2. 解析 OPF：`metadata`（dc:title、dc:creator）、`manifest`、`spine`。
3. 目录：优先 EPUB3 `nav.xhtml` 中的 `nav[epub:type=toc]`，否则用 EPUB2 `toc.ncx`。只取顶层与第二层条目。
4. 按 spine 顺序读取 XHTML，用 cheerio 转文本：删除 `script/style/nav`；`p, div, h1–h6, li, br, blockquote` 结尾换行；合并连续空行。
5. 分节：目录条目指向的文件（及锚点）为节的起点，直到下一个条目为止；没有目录时每个 spine 文件为一节，标题取首个 `h1–h3`，都没有则为"第 N 部分"。

### 1.3 PDF（`pdf.ts`）

1. unpdf：`getDocumentProxy` → `extractText(pdf, { mergePages: false })` 得到每页文本。
2. 平均每页有效字符 < 50 时判定为扫描版，报错"疑似扫描版 PDF，暂不支持，请先转成文字版或 txt"。
3. 若有书签（`pdf.getOutline()`），把顶层书签映射到页码（`getDestination` → `getPageIndex`）作为节边界。
4. 无书签则按标题正则切分（见 1.5），仍无结果则整本作为一节交给分块阶段切分。
5. 清理：删除每页重复出现的页眉页脚（在 ≥50% 页面首行或末行出现的相同文本），合并被换行打断的中文句子（行尾不是句末标点且下一行不以空白开头时直接拼接）。

### 1.4 txt / md（`text.ts`、`markdown.ts`）

- txt 编码：chardet 检测，GB18030/GBK/Big5 用 iconv-lite 转 UTF-8；检测失败按 UTF-8。中文 txt 很多是 GBK，**必须测试**。
- txt 分节：按标题正则切分（1.5）。
- md 分节：依次尝试以 `#`、`##`、`###` 作为分节级别，选第一个能切出 3–200 节的级别；都不满足则按 `#` 切分（可能只有 1 节，交给分块阶段）。去掉 Markdown 标记保留文本。

### 1.5 标题正则（txt 与无书签 PDF 共用）

单独成行、长度 ≤ 40：

```
^\s*(第[一二三四五六七八九十百千零〇\d]+[章节篇部回讲课])\s*.*$
^\s*(Chapter|CHAPTER|Part|PART)\s+[\dIVXLC]+\b.*$
^\s*\d{1,2}(\.\d{1,2})?\s+\S.{0,30}$          （仅当全文匹配数在 3–200 之间时启用）
```

### 1.6 分块（`chunk.ts`）

输入 sections，输出 `SourceChunk` 列表：

1. 去除空节。
2. **跳过**：标题匹配 `/^(目录|版权|版权信息|致谢|参考文献|索引|出版说明|contents|copyright|acknowledg|index|bibliography)/i` 的节，标为 `skipped`（界面可一键改回 pending）。
3. **合并**：字数 < `CHUNK_MIN_CHARS` 的节并入后一节（最后一节并入前一节），标题用"A / B"连接。
4. **切分**：字数 > `CHUNK_MAX_CHARS` 的节按段落边界切成若干份，每份尽量均匀且 ≤ 上限，标题为"原标题（i/n）"。不做重叠（重叠会让原文摘录重复命中），跨块的方法论由合并阶段去重。
5. 重新编号 `seq`。

## 2. 文本归一化（`src/domain/text-match.ts`）

```ts
normalize(s) = s
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, '')     // 去掉所有空白、标点、符号
```

归一化时同时产出"归一化下标 → 原文下标"的映射，用于把命中位置还原为原文片段。

## 3. 原文摘录核对

`matchExcerpt(excerpt: string, haystacks: { id, text }[]): SourceExcerpt`

1. `q = normalize(excerpt)`；`q.length < MATCH_MIN_CHARS` → `{ text: excerpt, chunkId: null, match: 'none' }`。
2. **精确**：在每个 haystack 的归一化文本中查找 `q`，命中则 `match='exact'`，`text` 替换为原文中对应的真实片段。
3. **模糊**：把 `q` 切成长度 8、步长 4 的片段（不足 8 取整体），统计在 haystack 归一化文本中出现的比例；比例 ≥ `FUZZY_THRESHOLD` 视为命中，`match='fuzzy'`，原文片段取"第一个命中片段起点到最后一个命中片段终点"并还原为原文（长度超过 `q.length * 2` 时截断）。
4. 都不命中 → `match='none'`，保留 AI 原文，`chunkId=null`。

界面：`exact` 显示"原文已核对"，`fuzzy` 显示"原文近似匹配"，`none` 显示黄色"未在原文中找到"，`inferred` 显示灰色"AI 推断"。

## 4. 证据核对与降级（`src/domain/evidence.ts`）

输入：AI 的 evidence 列表、用户消息 `{ turn, content }[]`。

对每条 evidence：

1. 在 `turn` 对应的用户消息中做 §3 同样的精确 → 模糊匹配；命中则 `quote` 替换为用户真实原话片段。
2. 未命中，则在其他用户消息中查找；命中则**修正 turn**。
3. 仍未命中 → `match='none'`。

降级规则（CONTEXT：引不出证据的"做到"一律不成立）：

| AI 判定 | 条件 | 结果 |
| --- | --- | --- |
| done / partial | 没有任何 `match !== 'none'` 的证据 | `verdict='missed'`，`quality=null`，`evidenceDowngraded=true` |
| violated | 没有任何有效证据 | `verdict='kept'`，`evidenceDowngraded=true` |
| 其他 | — | 不变 |

降级时保留 AI 原始 `aiVerdict / aiQuality` 以便展示"AI 认为做到了，但没能在你的原话中找到证据"。

## 5. 执行分（`src/domain/scoring.ts`）

### 5.1 判定与质量分收敛（写入 verdicts 前）

- `done`：quality 为空或 < 3 → 3；> 5 → 5。
- `partial`：quality 为空 → 2；> 3 → 3。
- `missed / not_triggered`：quality = null。
- 非条件步骤下出现 `not_triggered` → 改为 `missed`（校验阶段已要求重试，这里是防御）。

改判时同样套用这套规则校验入参（不合规返回 400）。

### 5.2 计算

输入：`selectedSnapshot.body`、生效判定（改判优先）、有效证据。

```
includedSteps = []
for step in body.steps:
    kvs = step.keyPoints 的生效判定
    if step.conditional and 所有 kvs 都是 not_triggered: 跳过该步骤（不计入分母）
    else:
        # 被触发的条件步骤中残留的 not_triggered 视为 missed
        values = kvs.map(v => v in {done, partial} ? quality/5 : 0)
        stepValue = mean(values)
        includedSteps.push(step, stepValue)

base = includedSteps 为空 ? 0 : mean(stepValue) * 100

violations = 生效判定为 violated 的原则数
principlePenalty = min(violations * PRINCIPLE_PENALTY, PRINCIPLE_PENALTY_CAP)

orderPenalty = 0
if body.orderMode == 'strict':
    seq = 按 body.steps 声明顺序，取 **非条件** 且至少有一个 done/partial 要点的步骤，
          每步取其有效证据中最小的 turn 作为 firstTurn
    if seq 的 firstTurn 不是单调不减: orderPenalty = ORDER_PENALTY，记录第一对逆序步骤

executionScore = clamp(round(base - principlePenalty - orderPenalty), 0, 100)
```

条件步骤不参与顺序检查，因为它们是对对方反应的应对，出现时机由对方决定。

### 5.3 输出（存入 `debriefs.scoreBreakdown`）

```ts
{
  base: number;                                   // 0–100，保留 1 位小数
  steps: { stepId, included: boolean, value: number | null }[];
  principlePenalty: number; violatedPrincipleIds: string[];
  orderPenalty: number; orderViolation: { earlierStepId, laterStepId } | null;
  executionScore: number;
}
```

改判或撤销改判后，重新执行 §5.2 并更新 `executionScore`、`scoreBreakdown`、`updatedAt`。

## 6. 识别（`src/domain/recognition.ts`）

仅 quiz：

```
selectedId == targetId            → 'correct'  (recognitionScore 1)
selectedId in alternatives[].id   → 'partial'  (recognitionScore 0.5)
否则                              → 'wrong'    (recognitionScore 0)
```

识别结果由代码计算，AI 只写解释。

## 7. 掌握度（`src/domain/mastery.ts`）

纯函数，输入该方法论相关的已复盘练习记录与当前时间。

```
execSessions  = 以该方法论为 selectedMethodologyId 的已复盘练习，按 endedAt 倒序取前 MASTERY_WINDOW 场
recogSessions = 以该方法论为目标方法论的 quiz 已复盘练习，倒序取前 MASTERY_WINDOW 场

若 execSessions 与 recogSessions 都为空 → mastery = 0（从未练过，最优先）

E = mean(executionScore/100 × (hintUsed ? MASTERY_HINT_FACTOR : 1))，execSessions 为空时 E = 0
R = recogSessions 为空 ? null : mean(recognitionScore)
base = R == null ? E : MASTERY_W_EXEC × E + MASTERY_W_RECOG × R

d = (now - 两类练习中最近一次 endedAt) / 1 天
decay = 0.5 + 0.5 × 2^(−d / MASTERY_HALF_LIFE_DAYS)     // 刚练过 = 1，越久越接近 0.5
mastery = base × decay                                  // 0–1
```

## 8. 选题（`src/domain/selection.ts`）

```ts
resolveScope(scope, confirmedMethodologies): Methodology[]   // tagIds ∪ sourceIds ∪ methodologyIds；全空 = 全部已确认
pickWeighted(items: { id, mastery }[], rng: () => number): string
```

- 权重 `w = (1 − mastery) + SELECTION_EPSILON`，按权重随机抽取；`rng` 可注入，测试用固定种子。
- 校验（service 层，返回 400 与中文信息）：
  - drill + pick：必须指定 1 个已确认方法论。
  - drill + random：范围内至少 1 个已确认方法论。
  - quiz：范围内至少 2 个已确认方法论（候选只有 1 个就没有识别可言）。quiz 的"指定"表示用户明确勾选一组方法论作为范围，目标仍在其中加权随机。
- quiz 的候选列表 = 范围内全部已确认方法论（含目标），写入 `scenarios.candidateIds`。

## 9. 统计口径（`src/server/services/stats.ts`）

通用规则：

- 只统计 `status='debriefed'` 的练习；分数一律用改判后重算的 `executionScore`。
- **执行**归属于 `selectedMethodologyId`；**识别**归属于目标方法论（`scenarios.targetMethodologyId`）。
- 方法论身份按 ID 聚合，而不是按快照内容（ADR-0003）；已归档方法论如有历史练习也要显示（标"已归档"）。
- 支持按标签、资料筛选（筛选的是方法论）。

### 9.1 方法论概览

每个方法论一行：

| 字段 | 口径 |
| --- | --- |
| drillCount / quizCount | 作为所用方法论的专项练习 / 综合测验场数 |
| execAvgAll / execAvgRecent | 全部 / 最近 5 场执行分均值 |
| execAvgWithHint / execAvgWithoutHint | 查看过提示 / 未查看提示的专项练习执行分均值 |
| execTrend | `{ endedAt, executionScore, difficulty, mode, hintUsed }[]`，按时间正序，最近 30 场 |
| recognitionAccuracy / recognitionN | 作为目标方法论的 quiz 中识别得分均值 / 场数 |
| mastery | §7 |
| lastPracticedAt | 两种角色中最近一次 endedAt |

默认按 mastery 升序（最需要练的在前）。

### 9.2 识别混淆

- 行：`{ targetId, targetName, selectedId, selectedName, wrongCount, partialCount }`，只列 `selectedId ≠ targetId` 的组合，按 `wrongCount + partialCount` 降序。
- 每行提供"对比"入口：`/library/compare?a={targetId}&b={selectedId}`，并排展示两者的适用条件、反例、步骤标题。

### 9.3 难度分层

- 总体：每个难度 `{ n, execAvg, outcomeDistribution: Record<Outcome, number> }`。
- 按方法论：`{ methodologyId, name, byDifficulty: Record<Difficulty, { n, execAvg } | null> }`，突出"配合档分数 − 强硬档分数"差值最大的方法论。
