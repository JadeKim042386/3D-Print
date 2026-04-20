/**
 * dimension-worker.ts
 *
 * BullMQ worker for dimension-based 3D generation.
 * This service is completely independent of the Meshy AI generation worker.
 *
 * Two generation paths — selected automatically by shape classification:
 *
 *   parametric        — mathematically exact STL (box, cylinder, bracket, etc.)
 *                       0 mm error, no AI, no provider calls
 *
 *   dimension_aware_ai — AI generation where the prompt is enriched with
 *                       physical dimension constraints so the model is
 *                       *designed* at the target size, not scaled afterward
 */

import { Worker, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationProvider } from "../types/generation.js";
import { classifyShape } from "../lib/shape-classifier.js";
import { generateParametricStl } from "../lib/parametric-generator.js";
import { buildDimensionAwarePrompt } from "../lib/dimension-prompt.js";
import { scaleMeshToDimensions, scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";
import {
  DIMENSION_QUEUE_NAME,
  type DimensionJobData,
  type DimensionJobResult,
} from "./dimension-queue.js";

export interface DimensionWorkerDeps {
  connection: ConnectionOptions;
  /** AI provider used for dimension_aware_ai path (Meshy or mock) */
  aiProvider: GenerationProvider;
  supabase: SupabaseClient;
  bucket: string;
}

export function createDimensionWorker(
  deps: DimensionWorkerDeps
): Worker<DimensionJobData, DimensionJobResult> {
  const { connection, aiProvider, supabase, bucket } = deps;

  const worker = new Worker<DimensionJobData, DimensionJobResult>(
    DIMENSION_QUEUE_NAME,
    async (job) => {
      const { modelId, prompt, dimensions } = job.data;

      await supabase.from("models").update({ status: "generating" }).eq("id", modelId);
      await job.updateProgress(10);

      // ------------------------------------------------------------------
      // Step 1: Classify the shape to choose the generation path
      // ------------------------------------------------------------------
      const classification = classifyShape(prompt);

      let modelBuffer: Buffer;
      let modelFormat: string;
      let providerJobId: string;
      let generationType: "parametric" | "dimension_aware_ai";

      if (classification.category === "parametric" && classification.parametricType) {
        // ----------------------------------------------------------------
        // Path A: Parametric — exact math, 0 mm error, no AI
        // ----------------------------------------------------------------
        console.log(
          `[dimension-worker] Parametric: ${classification.parametricType} ` +
          `(${dimensions.width_mm}×${dimensions.height_mm}×${dimensions.depth_mm}mm)`
        );

        modelBuffer = generateParametricStl({
          type: classification.parametricType,
          dimensions,
        });

        modelFormat = "stl";
        providerJobId = `parametric-${classification.parametricType}-${Date.now()}`;
        generationType = "parametric";

        await job.updateProgress(70);
      } else {
        // ----------------------------------------------------------------
        // Path B: Dimension-aware AI — model designed to target dimensions
        // ----------------------------------------------------------------
        console.log(
          `[dimension-worker] Dimension-aware AI: "${prompt}" ` +
          `(${dimensions.width_mm}×${dimensions.height_mm}×${dimensions.depth_mm}mm)`
        );

        const enrichedPrompt = buildDimensionAwarePrompt(prompt, dimensions);
        const { providerTaskId } = await aiProvider.createTask({ prompt: enrichedPrompt });
        providerJobId = providerTaskId;
        await job.updateProgress(20);

        const result = await aiProvider.waitForCompletion(providerTaskId, {
          pollIntervalMs: 5000,
          timeoutMs: 600_000,
        });
        await job.updateProgress(60);

        if (!result.modelUrl) throw new Error("AI provider returned no model URL");

        // Fine-tune: correct any residual dimensional drift after dimension-aware design
        const scaleFormat = (result.format === "glb" || result.format === "stl")
          ? result.format
          : "glb";

        const scaled = await scaleMeshToDimensions(result.modelUrl, dimensions, scaleFormat);
        modelBuffer = scaled.buffer;
        modelFormat = scaleFormat;
        generationType = "dimension_aware_ai";

        await job.updateProgress(70);
      }

      // ------------------------------------------------------------------
      // Step 2: Validate dimensional accuracy
      // ------------------------------------------------------------------
      const validationFormat = modelFormat === "stl" ? "stl" : "glb";
      const measured = await scaleBufferToDimensions(modelBuffer, dimensions, validationFormat);
      const maxDim = Math.max(dimensions.width_mm, dimensions.height_mm, dimensions.depth_mm);
      const validation = validateDimensions(dimensions, measured.actualDimensions, toleranceForSize(maxDim));

      await job.updateProgress(80);

      // ------------------------------------------------------------------
      // Step 3: Upload to Supabase Storage
      // ------------------------------------------------------------------
      const storagePath = `${modelId}/${providerJobId}.${modelFormat}`;
      const contentType = modelFormat === "glb" ? "model/gltf-binary" : "model/stl";

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, modelBuffer, { contentType, upsert: true });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      const storageUrl = urlData.publicUrl;

      await job.updateProgress(95);

      // ------------------------------------------------------------------
      // Step 4: Persist result
      // ------------------------------------------------------------------
      await supabase.from("models").update({
        status:                   "ready",
        file_url:                 storageUrl,
        provider_task_id:         providerJobId,
        provider:                 generationType === "parametric"
                                    ? `parametric-${classification.parametricType}`
                                    : aiProvider.name,
        format:                   modelFormat,
        generation_type:          generationType,
        actual_width_mm:          validation.actual.width_mm,
        actual_height_mm:         validation.actual.height_mm,
        actual_depth_mm:          validation.actual.depth_mm,
        dimensional_accuracy_pct: validation.accuracy_pct,
      }).eq("id", modelId);

      await job.updateProgress(100);

      return {
        modelId,
        storageUrl,
        generationType,
        accuracy_pct: validation.accuracy_pct,
      };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", async (job, error) => {
    Sentry.captureException(error, {
      tags: { queue: DIMENSION_QUEUE_NAME, jobId: job?.id, modelId: job?.data.modelId },
      extra: { prompt: job?.data.prompt, dimensions: job?.data.dimensions },
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
