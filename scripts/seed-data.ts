import { nanoid } from "nanoid";

import type {
  Concept,
  Item,
  KeyPoint,
  MethodologyBody,
  Principle,
  Step,
} from "../src/domain/schemas";

/**
 * 种子方法论（work-packages.md WP1 任务 7）。
 * 全部 `sourceId=null`、`createdBy='seed'`；没有资料来源，因此每个节点都不带原文摘录，
 * 并标记为 `inferred=true`（数据模型中 `excerpt=null` 与 `inferred=true` 成对出现）。
 */
export interface SeedMethodology {
  name: string;
  tags: string[];
  status: "confirmed" | "draft";
  body: MethodologyBody;
}

const node = () => ({ id: nanoid(), excerpt: null, inferred: true });

const item = (text: string): Item => ({ ...node(), text });

const keyPoint = (text: string): KeyPoint => ({ ...node(), text });

const principle = (kind: Principle["kind"], text: string): Principle => ({
  ...node(),
  kind,
  text,
});

const concept = (name: string, explanation: string, relatedStepIds: string[]): Concept => ({
  ...node(),
  name,
  explanation,
  relatedStepIds,
});

function step(input: {
  title: string;
  description: string;
  conditional?: boolean;
  trigger?: string;
  keyPoints: string[];
  exampleLines?: string[];
  commonMistakes?: string[];
}): Step {
  return {
    ...node(),
    title: input.title,
    description: input.description,
    conditional: input.conditional ?? false,
    trigger: input.trigger ?? null,
    keyPoints: input.keyPoints.map(keyPoint),
    exampleLines: input.exampleLines ?? [],
    commonMistakes: input.commonMistakes ?? [],
  };
}

/** 向领导提加薪。 */
const raiseSteps = [
  step({
    title: "预约专门的沟通时机",
    description: "不要在走廊、饭局或临时被叫去开会时谈钱，先约一个不受打扰的正式时段。",
    keyPoints: [
      "发出明确的会议邀约，说明想聊薪酬与发展，而不是“顺便说两句”",
      "把时间约在双方都不赶事的时段，避开月结、发布日和周五下班前",
    ],
    exampleLines: ["我想约您 20 分钟，聊一下我这一年的工作情况和薪酬，您看这周三下午方便吗？"],
    commonMistakes: ["在电梯里或团建饭桌上突然开口", "只说“有空吗”，不说明议题"],
  }),
  step({
    title: "用可核对的成果说明贡献",
    description: "讲清楚你做了什么、带来了什么结果，用数字和事实，而不是“我很辛苦”。",
    keyPoints: [
      "用具体数字或事实说明过去一年的成果，如项目结果、指标变化、额外承担的职责",
      "说明这些成果与当前薪酬的落差，而不是拿同事做比较",
    ],
    exampleLines: [
      "今年我独立负责了 A、B 两个项目，A 的续约率从 70% 提到 85%；同时接下了原本属于两个人的投放工作。",
    ],
    commonMistakes: ["罗列日常任务，没有结果和数字", "抱怨“某某跟我做一样的活拿得比我多”"],
  }),
  step({
    title: "明确提出具体数额与期望生效时间",
    description: "给出具体的涨幅区间和希望生效的日期，让对方可以回答“行”或“不行”，而不是让他猜。",
    keyPoints: [
      "给出有依据的具体数额或区间，依据可以是市场行情、内部同岗水平、成果增量",
      "明确提出期望的生效时间，例如“希望从下个季度生效”",
    ],
    exampleLines: ["综合今年的成果和市场行情，我希望月薪调整到 22k，从 7 月开始生效。"],
    commonMistakes: ["说“您看着给吧”", "只表达“我想要加薪”，不提数额与时间"],
  }),
  step({
    title: "追问条件与时间表",
    description:
      "不接受“今年没有预算”这类模糊答复，问清楚达成加薪需要满足什么条件、什么时候可以再谈。",
    conditional: true,
    trigger: "对方以预算、编制或流程为由拒绝或拖延",
    keyPoints: [
      "追问需要满足的具体条件：做到什么结果、等到哪个时间点、走什么流程",
      "约定下一次沟通的时间并当场确认，会后用消息复述一遍",
    ],
    exampleLines: [
      "明白。那如果我把 X 指标做到 Y，下一次调薪窗口是什么时候？我们能不能先约定 10 月再聊一次？",
    ],
    commonMistakes: ["听到“没预算”就放弃，不再追问", "当场情绪化，或拿离职作威胁"],
  }),
];

/** 结论先行的工作汇报。 */
const reportSteps = [
  step({
    title: "一句话给结论",
    description: "开口第一句就说结论或请求，让对方立刻知道要听什么、要做什么决定。",
    keyPoints: [
      "第一句就说结论或请求：要什么决定、要什么资源",
      "结论里带上关键数字或时间点",
    ],
    exampleLines: ["这个项目建议延期两周上线，因为压测发现了一个会导致数据错乱的问题。"],
    commonMistakes: ["从背景和过程讲起，结论放到最后", "先说“我简单说一下”，然后讲了十分钟"],
  }),
  step({
    title: "按重要性补充依据",
    description: "最多三条依据，先讲对方最关心的，再按需展开细节。",
    keyPoints: [
      "最多讲 3 条依据，先讲对方最关心的：成本、风险、客户影响",
      "每条依据之后停一下，确认对方是否需要细节",
    ],
    exampleLines: [
      "影响有三点：一是数据错乱会影响结算；二是修复加验证需要 10 个工作日；三是客户侧的演示可以照常进行。",
    ],
    commonMistakes: ["按时间顺序把过程全讲一遍", "细节堆砌，不给对方插话的机会"],
  }),
  step({
    title: "说清下一步与需要的支持",
    description: "明确下一步动作、负责人和时间点，把需要对方做的事单独提出来。",
    keyPoints: [
      "明确下一步动作、负责人和时间点",
      "需要对方做的事单独提出来，并给出默认选项",
    ],
    exampleLines: [
      "我这边今天开始修，下周三出复测报告；需要您跟客户打个招呼，把演示时间挪到下下周。",
    ],
    commonMistakes: ["以“大概就是这样”结尾，没有下一步", "把需要领导决策的事埋在细节里"],
  }),
];

/** 先共情再建议的安慰法。 */
const comfortSteps = [
  step({
    title: "先接住情绪，不评判",
    description: "先说出你观察到的情绪、复述他的处境，让他确认“你懂”。",
    keyPoints: [
      "说出你观察到的情绪并复述他的处境，例如“被当众否掉方案，你现在肯定又气又委屈”",
      "只用“嗯、我在听”这类回应接住情绪，先不解释、不反驳、不给方案",
    ],
    exampleLines: ["这事儿换谁都会难受。你先说说，我在听。"],
    commonMistakes: ["第一句就劝“别想太多”", "急着帮对方分析他哪里做错了"],
  }),
  step({
    title: "确认要倾听还是要建议",
    description: "在给建议前，先问清楚对方此刻想要的是陪伴，还是想听你的做法。",
    conditional: true,
    trigger: "对方表示想听你的看法，或问“我该怎么办”",
    keyPoints: [
      "用一句问话确认需求：“你是想让我陪你说说，还是想一起想个办法？”",
      "如果对方只想倾诉，就继续听，不塞建议",
    ],
    exampleLines: ["你现在是想骂一骂，还是想跟我一起想想接下来怎么办？"],
    commonMistakes: ["对方一问“怎么办”就立刻进入解决问题模式", "把建议包装成安慰，边安慰边指挥"],
  }),
  step({
    title: "再给具体的建议或帮助",
    description: "建议要具体、可执行，并留出对方拒绝的余地。",
    keyPoints: [
      "建议要具体可执行，用“我会这么做”而不是“你应该”",
      "主动提出你能分担的具体一件事，并给对方留出拒绝的余地",
    ],
    exampleLines: [
      "如果是我，我会先把手上的项目交接清楚，再谈赔偿。明天我陪你去一趟人事那边？",
    ],
    commonMistakes: ["用“我早就跟你说过”开头", "拿别人的类似经历压过对方的感受"],
  }),
];

/** 拒绝额外工作请求。 */
const refuseSteps = [
  step({
    title: "先表达理解与肯定",
    description: "先用一句话承认这件事确实值得做，再谈你的处境。",
    keyPoints: [
      "先用一句话肯定请求的价值或对方的处境",
      "接着说明这确实是一件该做的事，而不是“不重要”",
    ],
    exampleLines: ["这个客户确实很急，我理解你为什么来找我。"],
    commonMistakes: ["上来就说“不行”或直接摆困难", "用“这跟我没关系”撇清"],
  }),
  step({
    title: "说明当前优先级与接下它的代价",
    description: "用对方也知道的事实说明你的时间已被占满，以及接了会牺牲什么。",
    keyPoints: [
      "列出你手上正在做、对方也知道的重要交付，说明时间和精力已被占满",
      "说明如果接下这件事，哪件已承诺的事会受影响或延期",
    ],
    exampleLines: ["我这周要交 A 方案和 B 的验收，如果再接这件事，A 至少要推迟到下周三。"],
    commonMistakes: ["只说“我很忙”，不给具体事实", "把拒绝说成对人的判断，例如“你不能老找我”"],
  }),
  step({
    title: "给出替代方案",
    description: "给出可行的替代，并把选择权交回给对方。",
    keyPoints: [
      "给出可行的替代：改期、只做其中一部分、换人，或你只做评审",
      "把选择权交给对方，让他决定优先级",
    ],
    exampleLines: [
      "两个办法：一是这周五之后我来做；二是让小李先出初稿，我帮他把关。你看哪个更合适？",
    ],
    commonMistakes: ["只说“做不了”就没有下文", "替对方做决定，把话说死"],
  }),
  step({
    title: "重申边界并把排序交还对方",
    description: "不因施压就改变承诺，也不与对方争执，把“先做哪件”的决定明确交回给对方。",
    conditional: true,
    trigger: "对方以“领导要求”“就这一次”或人情施压，要求你无论如何接下来",
    keyPoints: [
      "重复你的边界和已有承诺，语气平稳，不做过多的解释",
      "提出由对方或其上级来定优先级，并把决定用文字确认下来",
    ],
    exampleLines: [
      "我确实排不开。如果必须今天动手，请你确认 A 方案顺延到下周，我立刻开始；或者我们一起找李经理定个优先级。",
    ],
    commonMistakes: ["被“就这一次”说服，后来又后悔", "升级成情绪冲突，指责对方不体谅"],
  }),
];

export const SEED_METHODOLOGIES: SeedMethodology[] = [
  {
    name: "向领导提加薪",
    tags: ["职场"],
    status: "confirmed",
    body: {
      summary:
        "先约到专门的沟通时机，用可核对的成果说明贡献，再提出具体的涨幅与生效时间；被以预算为由拒绝时，追问达成加薪的条件与时间表。",
      goal: "在不损害与领导关系的前提下，拿到明确的加薪答复或可执行的加薪时间表。",
      applicability: [
        item("你已经有一段时间（半年以上）的稳定产出，且岗位职责与薪酬明显不匹配。"),
        item("公司有常规的调薪或评估周期，或你的直接上级有权提出调薪建议。"),
        item("你和领导能进行一次不受打扰的单独沟通。"),
      ],
      counterIndications: [
        item("公司正在裁员、降薪或冻结编制，短期内没有任何调薪空间。"),
        item("你刚入职或刚调岗，不满一个评估周期。"),
      ],
      orderMode: "strict",
      steps: raiseSteps,
      principles: [
        principle("do", "全程对事不对人：谈成果与市场行情，不指责领导或公司。"),
        principle("dont", "不拿离职作威胁，不用情绪或资历施压。"),
      ],
      concepts: [
        concept(
          "锚定效应",
          "先提出的具体数额会成为后续谈判的参照点，所以要先给出有依据的数额，而不是等对方先开口。",
          [raiseSteps[2].id],
        ),
      ],
    },
  },
  {
    name: "结论先行的工作汇报",
    tags: ["职场"],
    status: "confirmed",
    body: {
      summary: "汇报时先说结论和需要对方决策的事，再按重要性补充依据，最后说明下一步与需要的支持。",
      goal: "让领导在最短时间内听懂结论、做出决策，并记住你希望他记住的那件事。",
      applicability: [
        item("向领导或跨部门同事汇报进展、方案或问题。"),
        item("对方时间有限，可能中途打断你。"),
        item("你希望对方做出一个明确决策或给你资源。"),
      ],
      counterIndications: [item("需要现场共创、逐步推导的头脑风暴或复盘讨论。")],
      orderMode: "loose",
      steps: reportSteps,
      principles: [
        principle("do", "先讲对方关心的结论、影响和需要他做什么，再讲自己做了多少工作。"),
        principle("dont", "不隐瞒坏消息，也不把风险说成“应该没问题”。"),
      ],
      concepts: [
        concept(
          "金字塔原理",
          "结论先行、以上统下：先给结论，再用不超过 3 条相互独立的依据支撑它。",
          [reportSteps[0].id, reportSteps[1].id],
        ),
      ],
    },
  },
  {
    name: "先共情再建议的安慰法",
    tags: ["亲密关系"],
    status: "confirmed",
    body: {
      summary: "对方情绪低落时，先接住并说出他的情绪，问清他要的是倾听还是建议，之后再谈具体做法。",
      goal: "让对方感到被理解和支持，而不是被评判或被讲道理。",
      applicability: [
        item("伴侣、家人或朋友刚遭遇挫折，情绪明显低落。"),
        item("你是对方愿意倾诉的对象，且现在有时间和精力陪他。"),
        item("事情不紧急，不需要立刻处理实际问题。"),
      ],
      counterIndications: [
        item("对方处于紧急或危险状态，需要先处理就医、报警、止损这类实际问题。"),
        item("你自己的情绪已经耗尽，此刻无法承接对方的情绪。"),
      ],
      orderMode: "strict",
      steps: comfortSteps,
      principles: [
        principle("do", "先确认对方的情绪，再谈事实和做法。"),
        principle("dont", "不说“我早就说过”，不比较谁更惨，不评判对方的情绪是否合理。"),
      ],
      concepts: [
        concept(
          "情绪验证",
          "先承认对方情绪的合理性（“换谁都会这样”），再谈事实和做法；被验证过情绪的人才愿意听建议。",
          [comfortSteps[0].id],
        ),
      ],
    },
  },
  {
    name: "拒绝额外工作请求",
    tags: ["职场"],
    status: "confirmed",
    body: {
      summary:
        "先表达理解与肯定，再说明当前的优先级与代价，给出替代方案；对方施压时重申边界，并把优先级排序的决定交还对方。",
      goal: "在不影响关系和交付的前提下，不接下超出你能力或职责范围的额外工作。",
      applicability: [
        item("同事或非直属上级要你在既有排期之外再接一件事。"),
        item("你手头已有明确的交付承诺和时间表。"),
        item("你和对方将来还要长期合作，需要保住关系。"),
      ],
      counterIndications: [
        item("对方是你的直属上级，且这件事属于你的岗位职责范围。"),
        item("请求涉及合规、安全等必须立即处理的紧急事项。"),
      ],
      orderMode: "loose",
      steps: refuseSteps,
      principles: [
        principle("do", "拒绝时给出理由与替代方案，让对方有路可走。"),
        principle("dont", "不承诺做不到的交付，也不为了显得配合而含糊答应。"),
      ],
      concepts: [
        concept(
          "边界",
          "拒绝的是这件事和它的时间点，不是这个人；说清边界的同时给出替代方案，关系才不会受伤。",
          [refuseSteps[2].id, refuseSteps[3].id],
        ),
      ],
    },
  },
  {
    name: "与同事澄清协作分歧",
    tags: ["职场"],
    status: "draft",
    body: {
      summary: "出现协作分歧时，先对齐事实与共同目标，再谈两个方案的差异与代价。",
      goal: "把“谁对谁错”的争论转成对同一目标的方案讨论。",
      applicability: [item("你和同事就同一个交付的做法产生分歧，僵持在各自的方案上。")],
      counterIndications: [item("分歧涉及职责归属或绩效评价，需要上级裁定。")],
      orderMode: "loose",
      steps: [
        step({
          title: "先对齐共同目标与事实",
          description: "先复述双方都认可的目标和已知事实，再区分哪些只是推测。",
          keyPoints: [
            "先复述双方都认可的目标和已知事实",
            "把还没有验证的推测单独列出来",
          ],
          exampleLines: ["我们的目标都是这版按时上线。现在已经确认的是接口还没有联调。"],
          commonMistakes: ["一上来就论证自己的方案更好"],
        }),
        step({
          title: "说明方案差异与各自代价",
          description: "说出两个方案的差别，以及各自的成本与风险。",
          keyPoints: [
            "说出两个方案的差别，以及各自的成本与风险",
            "用“我担心的是……”表达，而不是“你的方案有问题”",
          ],
          exampleLines: [
            "A 方案快，但压测做不完；B 方案稳一点，但要多两天。我担心的是上线后的稳定性。",
          ],
          commonMistakes: ["把方案差异说成对人的评价"],
        }),
      ],
      principles: [principle("do", "讨论方案，不评价人。")],
      concepts: [],
    },
  },
];
