import { Queue, type ConnectionOptions } from "bullmq";

export const EXPORT_QUEUE_NAME = "model-export";

export interface ExportJobData {
  exportId: string;
  modelId: string;
  sourceFileUrl: string;
  sourceFormat: "stl" | "glb";
  targetFormat: "stl" | "obj" | "glb" | "gltf" | "3mf";
}

export interface ExportJobResult {
  exportId: string;
  fileUrl: string;
  fileSizeBytes: number;
}

export function createExportQueue(
  connection: ConnectionOptions
): Queue<ExportJobData, ExportJobResult> {
  return new Queue<ExportJobData, ExportJobResult>(EXPORT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
    },
  });
}
