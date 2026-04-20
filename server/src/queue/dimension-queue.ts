import { Queue, type ConnectionOptions } from "bullmq";

export const DIMENSION_QUEUE_NAME = "dimension-generation";

/** Job data for dimension-based 3D generation */
export interface DimensionJobData {
  modelId: string;
  prompt: string;
  dimensions: {
    width_mm: number;
    height_mm: number;
    depth_mm: number;
    mode?: "proportional" | "exact";
  };
}

export interface DimensionJobResult {
  modelId: string;
  storageUrl: string;
  generationType: "parametric" | "dimension_aware_ai";
  accuracy_pct: number | null;
}

export function createDimensionQueue(
  connection: ConnectionOptions
): Queue<DimensionJobData, DimensionJobResult> {
  return new Queue<DimensionJobData, DimensionJobResult>(DIMENSION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}
