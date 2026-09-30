/**
 * 可调参数集中在此。
 * 领域代码与 service 不得再写魔法数字。
 */

/** 每场练习用户最多发言的轮数默认值；可在设置页修改。 */
export const MAX_TURNS_DEFAULT = 12;

/** 分块：低于此字数的章节并入相邻章节。 */
export const CHUNK_MIN_CHARS = 1500;

/** 分块：高于此字数的章节按段落切分。 */
export const CHUNK_MAX_CHARS = 20000;

/** 抽取并发数。 */
export const EXTRACT_CONCURRENCY = 2;

/** 判定与质量分的一致性范围。 */
export const QUALITY_RANGE = {
  done: { min: 3, max: 5 },
  partial: { min: 1, max: 3 },
} as const;

/** 违反一条原则的扣分。 */
export const PRINCIPLE_PENALTY = 10;

/** 原则扣分上限。 */
export const PRINCIPLE_PENALTY_CAP = 30;

/** 严格顺序方法论出现错序的扣分。 */
export const ORDER_PENALTY = 10;

/** 掌握度取最近 N 场练习。 */
export const MASTERY_WINDOW = 5;

/** 查看过提示的练习，执行分在掌握度中的折算系数。 */
export const MASTERY_HINT_FACTOR = 0.7;

/** 掌握度时间衰减的半衰期（天）。 */
export const MASTERY_HALF_LIFE_DAYS = 30;

/** 文本核对的最短匹配长度。 */
export const MATCH_MIN_CHARS = 4;

/** 文本模糊匹配的命中比例阈值。 */
export const FUZZY_THRESHOLD = 0.7;

/** 模糊匹配：把摘录切成定长片段，逐片段在原文中查找。 */
export const FUZZY_SEGMENT_LENGTH = 8;
export const FUZZY_SEGMENT_STEP = 4;

/** 去重聚类：条目超过批大小时分批，相邻批次重叠若干条目。 */
export const CLUSTER_BATCH_SIZE = 150;
export const CLUSTER_BATCH_OVERLAP = 20;

/** 单次 AI 请求超时（毫秒）。 */
export const LLM_TIMEOUT_MS = 180000;

/** SDK 的传输层重试次数（429/5xx/网络错误）。 */
export const LLM_TRANSPORT_RETRIES = 3;

/** JSON 输出不合规时的最大尝试次数（含首次）。 */
export const LLM_JSON_ATTEMPTS = 3;

/** llm_calls 中 requestMessages / responseText 的最大保留字符数（超出截断）。 */
export const LLM_LOG_MAX_CHARS = 200000;

/** 设置页允许的轮数上限范围（含端点）。 */
export const MAX_TURNS_MIN = 4;
export const MAX_TURNS_MAX = 30;

/** 资料上传的文件大小上限（50MB）。 */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** 门禁通行 Cookie 的有效期（毫秒）：7 天。 */
export const GATE_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 门禁口令连续输错的次数上限，以及计数与锁定的时间窗口（毫秒）。 */
export const GATE_MAX_FAILURES = 5;
export const GATE_FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** 判定扫描版 PDF 的平均每页有效字符下限。 */
export const PDF_MIN_CHARS_PER_PAGE = 50;

/** 判定页眉/页脚时，同一行文本需要出现的页面比例。 */
export const PDF_HEADER_FOOTER_PAGE_RATIO = 0.5;

/** 预估 token 的每字系数（界面标注"粗略估计"）。 */
export const TOKEN_ESTIMATE_PER_CHAR = 0.7;

/** 标题正则允许的最大行长。 */
export const TEXT_TITLE_MAX_CHARS = 40;

/** 数字编号标题正则启用所需的全文匹配数范围（含端点）。 */
export const TEXT_NUMBERED_TITLE_MIN_COUNT = 3;
export const TEXT_NUMBERED_TITLE_MAX_COUNT = 200;

/** Markdown 分节级别可接受的节数范围（含端点）。 */
export const MD_SECTION_MIN_COUNT = 3;
export const MD_SECTION_MAX_COUNT = 200;

/** 各难度允许的计划阻力数量（含端点）。 */
export const RESISTANCE_COUNT_RANGE = {
  cooperative: { min: 1, max: 2 },
  neutral: { min: 2, max: 3 },
  tough: { min: 3, max: 5 },
} as const;

/** 场景生成时提供给 AI 的同一目标方法论的最近场景标题数量，用于避免雷同。 */
export const SCENARIO_RECENT_TITLES = 10;

/** 可见字段泄露检查：长度不小于此值的步骤标题才参与比对（过短的标题误伤率高）。 */
export const SCENARIO_LEAK_MIN_STEP_TITLE_CHARS = 4;

/** 用户单条消息的字数上限。 */
export const MESSAGE_MAX_CHARS = 1000;

/** 对方单次回复 `reply` 的字数上限；提示词中要求更短，此为校验上限。 */
export const COUNTERPART_REPLY_MAX_CHARS = 300;

/** 提示词中要求对方每次回复不超过的字数。 */
export const COUNTERPART_REPLY_PROMPT_CHARS = 120;

/** 质量分的满分（1–5 星）。 */
export const QUALITY_MAX = 5;

/** AI 未给出质量分时，done / partial 判定采用的默认质量分。 */
export const QUALITY_DEFAULT = { done: 3, partial: 2 } as const;

/** 提示词中要求证据引用（用户原话逐字片段）的长度范围。 */
export const EVIDENCE_QUOTE_CHARS = { min: 4, max: 80 } as const;

/** 统计：概览中执行分趋势保留的最近场数。 */
export const STATS_TREND_LIMIT = 30;

/** 统计：概览中 execAvgRecent 取的最近场数。 */
export const STATS_RECENT_WINDOW = 5;

/** 首页「最需要练习」列出的方法论数量。 */
export const HOME_WEAKEST_COUNT = 3;

/** 首页「最近练习」列出的场数。 */
export const HOME_RECENT_SESSIONS = 5;

/** 历史页每页显示的练习场数。 */
export const HISTORY_PAGE_SIZE = 20;

/** 生成场景期间，全屏等待遮罩里阶段文案的轮播间隔（毫秒）；生成较慢，放慢些读得完。 */
export const SCENARIO_LOADING_MESSAGE_INTERVAL_MS = 4800;

/** 生成场景期间，全屏等待遮罩里等待秒数的刷新间隔（毫秒）。 */
export const SCENARIO_LOADING_TICK_MS = 1000;
