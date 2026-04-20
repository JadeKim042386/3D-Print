import { Worker, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationProvider } from "../types/generation.js";
import { uploadToStorage } from "../storage/supabase.js";
import { scaleMeshToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";
import {
  GENERATION_QUEUE_NAME,
  type GenerationJobData,
  type GenerationJobResult,
} from "./generation-queue.js";

export interface GenerationWorkerDeps {
  connection: ConnectionOptions;
  provider: GenerationProvider;
  supabase: SupabaseClient;
  bucket: string;
}

export function createGenerationWorker(
  deps: GenerationWorkerDeps
): Worker<GenerationJobData, GenerationJobResult> {
  const { connection, provider, supabase, bucket } = deps;

  const worker = new Worker<GenerationJobData, GenerationJobResult>(
    GENERATION_QUEUE_NAME,
    async (job) => {
      const { modelId, prompt, dimensions } = job.data;

      // Update model status to generating
      await supabase
        .from("models")
        .update({ status: "generating" })
        .eq("id", modelId);

      await job.updateProgress(10);

      // Create task on provider
      const { providerTaskId } = await provider.createTask({ prompt });

      await job.updateProgress(20);

      // Poll until completion
      const result = await provider.waitForCompletion(providerTaskId, {
        pollIntervalMs: 5000,
        timeoutMs: 600_000,
      });

      await job.updateProgress(70);

      if (!result.modelUrl) {
        throw new Error("Provider returned no model URL");
      }

      let storageUrl: string;
      let modelFormat = result.format;

      if (dimensions) {
        // ---------------------------------------------------------------
        // Dimension post-processing
        // ---------------------------------------------------------------
        const scaleFormat = (result.format === "glb" || result.format === "stl")
          ? result.format
          : "glb";

        const scaled = await scaleMeshToDimensions(
          result.modelUrl,
          {
            width_mm:  dimensions.width_mm,
            height_mm: dimensions.height_mm,
            depth_mm:  dimensions.depth_mm,
            mode:      dimensions.mode ?? "proportional",
          },
          scaleFormat
        );

        await job.updateProgress(85);

        // Validate dimensional accuracy
        const maxDim = Math.max(dimensions.width_mm, dimensions.height_mm, dimensions.depth_mm);
        const tolerance = toleranceForSize(maxDim);
        const validation = validateDimensions(
          {
            width_mm:  dimensions.width_mm,
            height_mm: dimensions.height_mm,
            depth_mm:  dimensions.depth_mm,
            mode:      dimensions.mode,
          },
          scaled.actualDimensions,
          tolerance
        );

        // Upload scaled model to Supabase Storage
        const storagePath = `${modelId}/${providerTaskId}-scaled.${scaleFormat}`;
        storageUrl = await uploadBufferToStorage(
          supabase,
          bucket,
          storagePath,
          scaled.buffer,
          scaleFormat === "glb" ? "model/gltf-binary" : "model/stl"
        );

        modelFormat = scaleFormat;

        await job.updateProgress(95);

        // Write dimension results back to the model record
        await supabase
          .from("models")
          .update({
            status:                   validation.passed ? "ready" : "ready",
            file_url:                 storageUrl,
            provider_task_id:         providerTaskId,
            provider:                 provider.name,
            thumbnail_url:            result.thumbnailUrl ?? null,
            format:                   modelFormat,
            actual_width_mm:          validation.actual.width_mm,
            actual_height_mm:         validation.actual.height_mm,
            actual_depth_mm:          validation.actual.depth_mm,
            dimensional_accuracy_pct: validation.accuracy_pct,
          })
          .eq("id", modelId);
      } else {
        // ---------------------------------------------------------------
        // No dimension constraints — upload original model as-is
        // ---------------------------------------------------------------
        const storagePath = `${modelId}/${providerTaskId}.${result.format}`;
        storageUrl = await uploadToStorage(
          supabase,
          bucket,
          storagePath,
          result.modelUrl
        );

        await job.updateProgress(95);

        await supabase
          .from("models")
          .update({
            status:           "ready",
            file_url:         storageUrl,
            provider_task_id: providerTaskId,
            provider:         provider.name,
            thumbnail_url:    result.thumbnailUrl ?? null,
            format:           result.format,
          })
          .eq("id", modelId);
      }

      await job.updateProgress(100);

      return { modelId, storageUrl, providerTaskId };
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", async (job, error) => {
    Sentry.captureException(error, {
      tags: {
        queue:   GENERATION_QUEUE_NAME,
        jobId:   job?.id,
        modelId: job?.data.modelId,
      },
      extra: {
        prompt:       job?.data.prompt,
        dimensions:   job?.data.dimensions,
        attemptsMade: job?.attemptsMade,
      },
    });

    if (job) {
      await supabase
        .from("models")
        .update({
          status:        "failed",
          error_message: error.message,
        })
        .eq("id", job.data.modelId);
    }
  });

  return worker;
}

/**
 * Upload an in-memory buffer to Supabase Storage (skipping the fetch step
 * used by the original uploadToStorage helper).
 */
async function uploadBufferToStorage(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
