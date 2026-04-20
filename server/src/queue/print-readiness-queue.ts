import { Queue, type ConnectionOptions } from "bullmq";

export const PRINT_READINESS_QUEUE_NAME = "print-readiness";

export interface PrintReadinessJobData {
  modelId: string;
  fileUrl: string;
  format: "stl" | "glb";
  /** Number of regeneration retries already attempted (0 = first pass) */
  retryCount?: number;
}

export interface PrintReadinessJobResult {
  modelId: string;
  printQualityScore: number;
  printReady: boolean;
  repairsApplied: string[];
}

export function createPrintReadinessQueue(
  connection: ConnectionOptions
): Queue<PrintReadinessJobData, PrintReadinessJobResult> {
  return new Queue<PrintReadinessJobData, PrintReadinessJobResult>(
    PRINT_READINESS_QUEUE_NAME,
    {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    }
  );
}
