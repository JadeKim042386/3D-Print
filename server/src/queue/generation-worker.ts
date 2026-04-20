import { Worker, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationProvider } from "../types/generation.js";
import { uploadToStorage } from "../storage/supabase.js";
import { scaleMeshToDimensions, scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";
import { classifyShape } from "../lib/shape-classifier.js";
import { generateParametricStl } from "../lib/parametric-generator.js";
import { buildDimensionAwarePrompt } from "../lib/dimension-prompt.js";
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

      // -----------------------------------------------------------------------
      // If no dimension constraints, use original direct AI path
      // -----------------------------------------------------------------------
      if (!dimensions) {
        const { providerTaskId } = await provider.createTask({ prompt });
        await job.updateProgress(30);

        const result = await provider.waitForCompletion(providerTaskId, {
          pollIntervalMs: 5000,
          timeoutMs: 600_000,
        });
        await job.updateProgress(85);

        if (!result.modelUrl) throw new Error("Provider returned no model URL");

        const storagePath = `${modelId}/${providerTaskId}.${result.format}`;
        const storageUrl = await uploadToStorage(supabase, bucket, storagePath, result.modelUrl);
        await job.updateProgress(95);

        await supabase.from("models").update({
          status:           "ready",
          file_url:         storageUrl,
          provider_task_id: providerTaskId,
          provider:         provider.name,
          thumbnail_url:    result.thumbnailUrl ?? null,
          format:           result.format,
        }).eq("id", modelId);

        await job.updateProgress(100);
        return { modelId, storageUrl, providerTaskId };
      }

      // -----------------------------------------------------------------------
      // Dimension-guided generation: classify the shape first
      // -----------------------------------------------------------------------
      const classification = classifyShape(prompt);

      let storageUrl: string;
      let modelFormat: string;
      let providerTaskId: string;
      let modelBuffer: Buffer;

      if (classification.category === "parametric" && classification.parametricType) {
        // -------------------------------------------------------------------
        // Track 1 — Parametric generation: exact math, no AI, 0 mm error
        // -------------------------------------------------------------------
        console.log(
          `[worker] Parametric path: ${classification.parametricType} ` +
          `(confidence ${classification.confidence.toFixed(2)})`
        );

        modelBuffer = generateParametricStl({
          type: classification.parametricType,
          dimensions,
        });

        providerTaskId = `parametric-${classification.parametricType}-${Date.now()}`;
        modelFormat = "stl";

        await job.updateProgress(70);
      } else {
        // -------------------------------------------------------------------
        // Track 2 — Dimension-aware AI generation: design to dimensions
        // -------------------------------------------------------------------
        console.log(
          `[worker] Organic AI path (confidence ${classification.confidence.toFixed(2)})`
        );

        // Enrich the prompt with physical dimension context so the AI
        // designs the object at the correct size, not arbitrarily scaled.
        const dimensionAwarePrompt = buildDimensionAwarePrompt(prompt, dimensions);

        const created = await provider.createTask({ prompt: dimensionAwarePrompt });
        providerTaskId = created.providerTaskId;
        await job.updateProgress(20);

        const result = await provider.waitForCompletion(providerTaskId, {
          pollIntervalMs: 5000,
          timeoutMs: 600_000,
        });
        await job.updateProgress(60);

        if (!result.modelUrl) throw new Error("Provider returned no model URL");

        // Fine-tune: apply scale correction for any residual dimensional drift.
        // Because the AI was designed at the right size, this should be a
        // small correction (±2–5%), not the primary sizing mechanism.
        const scaleFormat = (result.format === "glb" || result.format === "stl")
          ? result.format
          : "glb";

        const scaled = await scaleMeshToDimensions(result.modelUrl, dimensions, scaleFormat);
        modelBuffer = scaled.buffer;
        modelFormat = scaleFormat;

        await job.updateProgress(70);
      }

      // -----------------------------------------------------------------------
      // Validate dimensional accuracy
      // -----------------------------------------------------------------------
      const maxDim = Math.max(dimensions.width_mm, dimensions.height_mm, dimensions.depth_mm);
      const tolerance = toleranceForSize(maxDim);

      // Re-measure actual AABB from the final buffer
      const validationFormat = modelFormat === "stl" ? "stl" : "glb";
      const measured = await scaleBufferToDimensions(modelBuffer, dimensions, validationFormat);
      // scaleBufferToDimensions with the same target just re-measures without further scaling
      // if the buffer is already at target. For parametric, it should be ~0 mm error.

      const validation = validateDimensions(dimensions, measured.actualDimensions, tolerance);

      // -----------------------------------------------------------------------
      // Upload to Supabase Storage
      // -----------------------------------------------------------------------
      const storagePath = `${modelId}/${providerTaskId}.${modelFormat}`;
      storageUrl = await uploadBufferToStorage(
        supabase,
        bucket,
        storagePath,
        modelBuffer,
        modelFormat === "glb" ? "model/gltf-binary" : "model/stl"
      );

      await job.updateProgress(95);

      // -----------------------------------------------------------------------
      // Persist result
      // -----------------------------------------------------------------------
      await supabase.from("models").update({
        status:                   "ready",
        file_url:                 storageUrl,
        provider_task_id:         providerTaskId,
        provider:                 classification.category === "parametric"
                                    ? `parametric-${classification.parametricType}`
                                    : provider.name,
        thumbnail_url:            null,
        format:                   modelFormat,
        actual_width_mm:          validation.actual.width_mm,
        actual_height_mm:         validation.actual.height_mm,
        actual_depth_mm:          validation.actual.depth_mm,
        dimensional_accuracy_pct: validation.accuracy_pct,
      }).eq("id", modelId);

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
      await supabase.from("models").update({
        status:        "failed",
        error_message: error.message,
      }).eq("id", job.data.modelId);
    }
  });

  return worker;
}

/**
 * Upload an in-memory buffer to Supabase Storage.
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
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
