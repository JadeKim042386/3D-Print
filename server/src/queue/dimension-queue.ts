import { Queue, type ConnectionOptions } from "bullmq";

export const DIMENSION_QUEUE_NAME = "dimension-generation";

/** Job data for dimension-based 3D generation (new or refit) */
export interface DimensionJobData {
  modelId: string;
  prompt: string;
  dimensions: {
    width_mm: number;
    height_mm: number;
    depth_mm: number;
    mode?: "proportional" | "exact";
  };

  /**
   * Refit context — set when this job is a dimension refit of an existing model.
   * The worker downloads the existing model file and re-scales it rather than
   * generating from scratch (for AI models). Parametric models are re-generated.
   */
  refit?: {
    /** ID of the original model being refitted */
    sourceModelId: string;
    /** Public URL of the existing model file to download */
    sourceFileUrl: string;
    /** Format of the existing model file */
    sourceFormat: "stl" | "glb";
    /** Original generation type — determines refit strategy */
    sourceGenerationType: "parametric" | "dimension_aware_ai";
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
