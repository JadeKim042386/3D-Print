/**
 * export-worker.ts
 *
 * BullMQ worker for async model format conversion.
 * Downloads the source model, converts to target format,
 * uploads to Supabase Storage, and updates the model_exports row.
 */

import { Worker, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXPORT_QUEUE_NAME,
  type ExportJobData,
  type ExportJobResult,
} from "./export-queue.js";
import { convertModel, type SourceFormat, type ExportFormat } from "../lib/format-converter.js";

const CONTENT_TYPE_MAP: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  stl: "model/stl",
  obj: "text/plain",
  "3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
};

export interface ExportWorkerDeps {
  connection: ConnectionOptions;
  supabase: SupabaseClient;
  bucket: string;
}

export function createExportWorker(
  deps: ExportWorkerDeps
): Worker<ExportJobData, ExportJobResult> {
  const { connection, supabase, bucket } = deps;

  const worker = new Worker<ExportJobData, ExportJobResult>(
    EXPORT_QUEUE_NAME,
    async (job) => {
      const { exportId, modelId, sourceFileUrl, sourceFormat, targetFormat } = job.data;

      // Mark as converting
      await supabase
        .from("model_exports")
        .update({ status: "converting" })
        .eq("id", exportId);

      await job.updateProgress(10);

      // Download source model
      const response = await fetch(sourceFileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download source model: HTTP ${response.status}`);
      }
      const sourceBuffer = Buffer.from(await response.arrayBuffer());
      await job.updateProgress(30);

      // Convert
      const converted = convertModel(
        sourceBuffer,
        sourceFormat as SourceFormat,
        targetFormat as ExportFormat
      );
      await job.updateProgress(70);

      // Upload to storage
      const ext = targetFormat === "gltf" ? "glb" : targetFormat;
      const storagePath = `${modelId}/exports/${modelId}.${ext}`;
      const contentType = CONTENT_TYPE_MAP[targetFormat] ?? "application/octet-stream";

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, converted, { contentType, upsert: true });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      await job.updateProgress(90);

      // Update export record
      await supabase
        .from("model_exports")
        .update({
          status: "ready",
          file_url: urlData.publicUrl,
          file_size_bytes: converted.length,
        })
        .eq("id", exportId);

      await job.updateProgress(100);

      return {
        exportId,
        fileUrl: urlData.publicUrl,
        fileSizeBytes: converted.length,
      };
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", async (job, error) => {
    Sentry.captureException(error, {
      tags: { queue: EXPORT_QUEUE_NAME, jobId: job?.id },
      extra: { exportId: job?.data.exportId, targetFormat: job?.data.targetFormat },
    });

    if (job) {
      await supabase
        .from("model_exports")
        .update({
          status: "failed",
          error_message: error.message,
        })
        .eq("id", job.data.exportId);
    }
  });

  return worker;
}
