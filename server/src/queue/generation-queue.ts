import { Queue, type ConnectionOptions } from "bullmq";

export const GENERATION_QUEUE_NAME = "generation";

export interface GenerationJobData {
  modelId: string;
  prompt: string;
  format?: string;
}

export interface GenerationJobResult {
  modelId: string;
  storageUrl: string;
  providerTaskId: string;
}

export function createGenerationQueue(connection: ConnectionOptions): Queue<GenerationJobData, GenerationJobResult> {
  return new Queue<GenerationJobData, GenerationJobResult>(GENERATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });
}
