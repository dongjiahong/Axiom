import { RECOGNITION_SCORE } from "./constants";
import type { Recognition } from "./schemas";

/** 识别结果：由代码计算，AI 只写解释。 */
export function computeRecognition(params: {
  selectedId: string;
  targetId: string;
  alternativeIds: string[];
}): { recognition: Recognition; score: number } {
  const recognition: Recognition =
    params.selectedId === params.targetId
      ? "correct"
      : params.alternativeIds.includes(params.selectedId)
        ? "partial"
        : "wrong";
  return { recognition, score: RECOGNITION_SCORE[recognition] };
}
