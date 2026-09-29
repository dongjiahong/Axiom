import { describe, expect, it } from "vitest";

import { RESISTANCE_COUNT_RANGE } from "@/domain/constants";
import type { Difficulty, PracticeMode } from "@/domain/schemas";
import {
  buildScenarioInput,
  scenarioTask,
  validateScenario,
  type ScenarioInput,
  type ScenarioOutput,
} from "@/server/prompts/scenario";

import { makeKeyPoint, makeMethodologyBody, makeStep } from "../fixtures/methodology";

function makeInput(
  overrides: { mode?: PracticeMode; difficulty?: Difficulty; conditionalSteps?: number } = {},
): ScenarioInput {
  const conditionalSteps = overrides.conditionalSteps ?? 1;
  const steps = [
    makeStep({ title: "预约合适的时机", keyPoints: [makeKeyPoint()] }),
    makeStep({ title: "说明", keyPoints: [makeKeyPoint()] }),
    ...Array.from({ length: conditionalSteps }, (_, i) =>
      makeStep({
        title: `应对对方的拒绝${i + 1}`,
        conditional: true,
        trigger: `对方拒绝${i + 1}`,
      }),
    ),
  ];
  return buildScenarioInput({
    mode: overrides.mode ?? "quiz",
    difficulty: overrides.difficulty ?? "neutral",
    target: { name: "向领导提加薪", body: makeMethodologyBody({ steps }) },
    others: [
      { name: "拒绝额外工作请求", body: makeMethodologyBody() },
      { name: "结论先行的工作汇报", body: makeMethodologyBody() },
    ],
    recentTitles: [],
  });
}

/** 从 fake 输出出发做小改动，得到只违反某一条规则的输出。 */
function variant(input: ScenarioInput, patch: (o: ScenarioOutput) => void): ScenarioOutput {
  const output = structuredClone(scenarioTask.fake(input));
  patch(output);
  return output;
}

describe("buildScenarioInput", () => {
  it("使用短引用：步骤 s1..，其余方法论 m1..", () => {
    const input = makeInput({ conditionalSteps: 1 });
    expect(input.target.steps.map((s) => s.ref)).toEqual(["s1", "s2", "s3"]);
    expect(input.target.steps[2]).toMatchObject({ conditional: true, trigger: "对方拒绝1" });
    expect(input.others.map((o) => o.ref)).toEqual(["m1", "m2"]);
  });
});

describe("scenario fake()", () => {
  const difficulties: Difficulty[] = ["cooperative", "neutral", "tough"];
  for (const mode of ["drill", "quiz"] as const) {
    for (const difficulty of difficulties) {
      for (const conditionalSteps of [0, 1, 2, 6]) {
        it(`${mode} / ${difficulty} / ${conditionalSteps} 个条件步骤：通过 schema 与语义校验`, () => {
          const input = makeInput({ mode, difficulty, conditionalSteps });
          const output = scenarioTask.fake(input);
          expect(scenarioTask.schema.safeParse(output).success).toBe(true);
          expect(validateScenario(output, input)).toEqual([]);
        });
      }
    }
  }

  it("综合测验的 fake 带一个备选方法论，专项练习没有", () => {
    expect(scenarioTask.fake(makeInput({ mode: "quiz" })).alternatives).toHaveLength(1);
    expect(scenarioTask.fake(makeInput({ mode: "drill" })).alternatives).toHaveLength(0);
  });

  it("fake 标题包含 recentTitles.length + 1，用于区分", () => {
    const input = { ...makeInput(), recentTitles: ["a", "b"] };
    expect(scenarioTask.fake(input).title).toContain("3");
  });
});

describe("validateScenario", () => {
  const input = makeInput({ difficulty: "neutral" });

  it("openingSpeaker 与 openingLine 必须一致", () => {
    expect(
      validateScenario(variant(input, (o) => (o.openingLine = null)), input).join(),
    ).toContain("openingLine 不能为空");
    expect(
      validateScenario(variant(input, (o) => (o.openingSpeaker = "user")), input).join(),
    ).toContain("openingLine 必须为 null");
    expect(
      validateScenario(
        variant(input, (o) => {
          o.openingSpeaker = "user";
          o.openingLine = null;
        }),
        input,
      ),
    ).toEqual([]);
  });

  describe("可见字段不得泄露方法论名称与步骤标题", () => {
    const fields: [string, (o: ScenarioOutput, text: string) => void][] = [
      ["title", (o, t) => (o.title = t)],
      ["background", (o, t) => (o.background = t)],
      ["userRole", (o, t) => (o.userRole = t)],
      ["userGoal", (o, t) => (o.userGoal = t)],
      ["counterpart.name", (o, t) => (o.counterpart.name = t)],
      ["counterpart.relation", (o, t) => (o.counterpart.relation = t)],
      ["counterpart.profile", (o, t) => (o.counterpart.profile = t)],
      ["openingLine", (o, t) => (o.openingLine = t)],
    ];
    for (const [field, set] of fields) {
      it(`${field} 含目标方法论名称时报错`, () => {
        const errors = validateScenario(variant(input, (o) => set(o, "你想去向领导提加薪。")), input);
        expect(errors.some((e) => e.includes(field) && e.includes("向领导提加薪"))).toBe(true);
      });
    }

    it("含其他方法论名称时报错（忽略标点与空白）", () => {
      const errors = validateScenario(
        variant(input, (o) => (o.background = "你正在考虑 拒绝，额外工作请求。")),
        input,
      );
      expect(errors.some((e) => e.includes("拒绝额外工作请求"))).toBe(true);
    });

    it("含长度 ≥4 的步骤标题时报错，过短的步骤标题不参与比对", () => {
      expect(
        validateScenario(variant(input, (o) => (o.userGoal = "先预约合适的时机再说")), input).some(
          (e) => e.includes("预约合适的时机"),
        ),
      ).toBe(true);
      // "说明" 只有 2 个字，不算泄露
      expect(validateScenario(variant(input, (o) => (o.userGoal = "把事情说明白")), input)).toEqual([]);
    });

    it("隐藏字段（角色卡、designNotes）可以出现方法论名称", () => {
      const output = variant(input, (o) => {
        o.designNotes = "向领导提加薪最适合这个场景，区别于拒绝额外工作请求。";
        o.brief.trueStance = "担心向领导提加薪会被拒绝";
      });
      expect(validateScenario(output, input)).toEqual([]);
    });
  });

  describe("计划阻力", () => {
    const resistance = (linkedStepRef: string | null) => ({
      trigger: "t",
      reaction: "r",
      linkedStepRef,
    });

    it("数量必须符合难度", () => {
      for (const difficulty of ["cooperative", "neutral", "tough"] as const) {
        const range = RESISTANCE_COUNT_RANGE[difficulty];
        const target = makeInput({ difficulty, conditionalSteps: 1 });
        const build = (n: number) =>
          variant(target, (o) => {
            o.brief.plannedResistance = [
              resistance("s3"),
              ...Array.from({ length: n - 1 }, () => resistance(null)),
            ];
          });
        expect(validateScenario(build(range.min), target)).toEqual([]);
        expect(validateScenario(build(range.max), target)).toEqual([]);
        expect(validateScenario(build(range.max + 1), target).join()).toContain("应有");
        if (range.min > 1) {
          expect(validateScenario(build(range.min - 1), target).join()).toContain("应有");
        }
      }
    });

    it("linkedStepRef 指向非条件步骤或不存在的引用时报错", () => {
      const nonConditional = validateScenario(
        variant(input, (o) => (o.brief.plannedResistance[0].linkedStepRef = "s1")),
        input,
      );
      expect(nonConditional.join()).toContain("不是条件步骤");
      const unknown = validateScenario(
        variant(input, (o) => (o.brief.plannedResistance[0].linkedStepRef = "s99")),
        input,
      );
      expect(unknown.join()).toContain("不是目标方法论的步骤引用");
    });

    it("一般/强硬难度下每个条件步骤都要被关联", () => {
      for (const difficulty of ["neutral", "tough"] as const) {
        const target = makeInput({ difficulty, conditionalSteps: 2 });
        const output = variant(target, (o) => {
          o.brief.plannedResistance = Array.from(
            { length: RESISTANCE_COUNT_RANGE[difficulty].min },
            () => resistance("s3"),
          );
        });
        expect(validateScenario(output, target).join()).toContain("尚未关联：s4");
      }
    });

    it("配合难度不强制关联条件步骤", () => {
      const target = makeInput({ difficulty: "cooperative", conditionalSteps: 2 });
      const output = variant(target, (o) => (o.brief.plannedResistance = [resistance(null)]));
      expect(validateScenario(output, target)).toEqual([]);
    });
  });

  it("alternatives 的引用必须在 others 中；专项练习允许为空", () => {
    expect(
      validateScenario(
        variant(input, (o) => (o.alternatives = [{ ref: "m9", reason: "x" }])),
        input,
      ).join(),
    ).toContain("alternatives[0].ref");
    expect(validateScenario(variant(input, (o) => (o.alternatives = [])), input)).toEqual([]);
  });
});
