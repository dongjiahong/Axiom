/**
 * 可调参数集中在此（见 docs/plan/README.md §6）。
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

/** 判定与质量分的一致性范围（algorithms.md §5.1）。 */
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

/** 掌握度中执行分的权重。 */
export const MASTERY_W_EXEC = 0.6;

/** 掌握度中识别正确率的权重。 */
export const MASTERY_W_RECOG = 0.4;

/** 查看过提示的练习，执行分在掌握度中的折算系数。 */
export const MASTERY_HINT_FACTOR = 0.7;

/** 掌握度时间衰减的半衰期（天）。 */
export const MASTERY_HALF_LIFE_DAYS = 30;

/** 加权随机选题的基础权重，保证高掌握度也有机会被抽到。 */
export const SELECTION_EPSILON = 0.1;

/** 文本核对的最短匹配长度。 */
export const MATCH_MIN_CHARS = 4;

/** 文本模糊匹配的命中比例阈值。 */
export const FUZZY_THRESHOLD = 0.7;

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
