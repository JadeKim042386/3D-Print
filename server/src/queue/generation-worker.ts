/**
 * generation-worker.ts
 *
 * BullMQ worker for Meshy AI text-to-3D generation.
 * Handles jobs from the "generation" queue only.
 *
 * For dimension-based generation use the separate dimension-worker service.
 */

import { Worker, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationProvider } from "../types/generation.js";
import { uploadToStorage } from "../storage/supabase.js";
import {
  GENERATION_QUEUE_NAME,
  type GenerationJobData,
  type GenerationJobResult,
} from "./generation-queue.js";
import type { Queue } from "bullmq";
import type { PrintReadinessJobData, PrintReadinessJobResult } from "./print-readiness-queue.js";
import type { Mailer } from "../lib/mailer.js";

export interface GenerationWorkerDeps {
  connection: ConnectionOptions;
  provider: GenerationProvider;
  supabase: SupabaseClient;
  bucket: string;
  /** Optional: enqueue print-readiness validation after completion */
  printReadinessQueue?: Queue<PrintReadinessJobData, PrintReadinessJobResult>;
  /** Optional: send transactional emails */
  mailer?: Mailer | null;
}

export function createGenerationWorker(
  deps: GenerationWorkerDeps
): Worker<GenerationJobData, GenerationJobResult> {
  const { connection, provider, supabase, bucket } = deps;

  const worker = new Worker<GenerationJobData, GenerationJobResult>(
    GENERATION_QUEUE_NAME,
    async (job) => {
      const { modelId, prompt } = job.data;

      // Mark as generating
      await supabase.from("models").update({ status: "generating" }).eq("id", modelId);
      await job.updateProgress(10);

      // Create generation task with Meshy (or configured provider)
      const { providerTaskId } = await provider.createTask({ prompt });
      await job.updateProgress(20);

      // Poll until the provider completes
      const result = await provider.waitForCompletion(providerTaskId, {
        pollIntervalMs: 5000,
        timeoutMs: 600_000,
      });
      await job.updateProgress(80);

      if (!result.modelUrl) throw new Error("Provider returned no model URL");

      // Download from provider and upload to Supabase Storage
      const storagePath = `${modelId}/${providerTaskId}.${result.format}`;
      const storageUrl = await uploadToStorage(supabase, bucket, storagePath, result.modelUrl);
      await job.updateProgress(95);

      // Persist result
      await supabase.from("models").update({
        status:           "ready",
        file_url:         storageUrl,
        provider_task_id: providerTaskId,
        provider:         provider.name,
        thumbnail_url:    result.thumbnailUrl ?? null,
        format:           result.format,
        generation_type:  "ai",
      }).eq("id", modelId);

      // Enqueue print-readiness validation
      if (deps.printReadinessQueue && result.format) {
        const fmt = (result.format === "stl" || result.format === "glb")
          ? result.format
          : "glb" as const;
        await deps.printReadinessQueue.add("validate", {
          modelId,
          fileUrl: storageUrl,
          format: fmt,
        });
      }

      // Send generation-complete email (fire-and-forget)
      if (deps.mailer) {
        const { data: modelRow } = await supabase
          .from("models")
          .select("user_id, prompt")
          .eq("id", modelId)
          .single();

        if (modelRow) {
          const { data: user } = await supabase
            .from("users")
            .select("email, display_name")
            .eq("id", modelRow.user_id)
            .single();

          if (user?.email) {
            void deps.mailer.sendGenerationComplete({
              to: user.email,
              modelId,
              prompt: modelRow.prompt ?? undefined,
              displayName: user.display_name ?? undefined,
            });
          }
        }
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
      tags: { queue: GENERATION_QUEUE_NAME, jobId: job?.id, modelId: job?.data.modelId },
      extra: { prompt: job?.data.prompt, attemptsMade: job?.attemptsMade },
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
