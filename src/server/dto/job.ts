import type { JobStage, JobStatus, jobs } from "@/server/db/schema";

export interface JobDto {
  id: string;
  sourceId: string;
  status: JobStatus;
  stage: JobStage | null;
  progressDone: number;
  progressTotal: number;
  error: string | null;
}

export function toJobDto(row: typeof jobs.$inferSelect): JobDto {
  return {
    id: row.id,
    sourceId: row.payload.sourceId,
    status: row.status,
    stage: row.stage,
    progressDone: row.progressDone,
    progressTotal: row.progressTotal,
    error: row.error,
  };
}
