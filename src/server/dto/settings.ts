import type { LLMSettings, PracticeSettings } from "@/server/llm/settings";
import { maskApiKey } from "@/server/llm/settings";

export interface SettingsDto {
  llm: {
    baseUrl: string;
    model: string;
    apiKeyMasked: string;
    supportsJsonMode: boolean | null;
    supportsTemperature: boolean | null;
    testedAt: number | null;
    overriddenByEnv: boolean;
  };
  practice: { maxTurns: number };
}

/** 设置 DTO：API Key 只以掩码形式出现。 */
export function toSettingsDto(input: {
  llm: LLMSettings;
  overriddenByEnv: boolean;
  practice: PracticeSettings;
}): SettingsDto {
  const { llm } = input;
  return {
    llm: {
      baseUrl: llm.baseUrl,
      model: llm.model,
      apiKeyMasked: maskApiKey(llm.apiKey),
      supportsJsonMode: llm.supportsJsonMode,
      supportsTemperature: llm.supportsTemperature,
      testedAt: llm.testedAt,
      overriddenByEnv: input.overriddenByEnv,
    },
    practice: { maxTurns: input.practice.maxTurns },
  };
}
