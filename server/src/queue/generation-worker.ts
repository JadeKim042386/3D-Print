import { Worker, type ConnectionOptions } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationProvider } from "../types/generation.js";
import { uploadToStorage } from "../storage/supabase.js";
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
      const { modelId, prompt } = job.data;

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

      await job.updateProgress(80);

      if (!result.modelUrl) {
        throw new Error("Provider returned no model URL");
      }

      // Upload to Supabase Storage
      const storagePath = `${modelId}/${providerTaskId}.${result.format}`;
      const storageUrl = await uploadToStorage(
        supabase,
        bucket,
        storagePath,
        result.modelUrl
      );

      await job.updateProgress(95);

      // Update model record
      await supabase
        .from("models")
        .update({
          status: "ready",
          storage_url: storageUrl,
          provider_task_id: providerTaskId,
          provider_name: provider.name,
        })
        .eq("id", modelId);

      await job.updateProgress(100);

      return { modelId, storageUrl, providerTaskId };
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", async (job, error) => {
    if (job) {
      await supabase
        .from("models")
        .update({
          status: "failed",
          error_message: error.message,
        })
        .eq("id", job.data.modelId);
    }
  });

  return worker;
}
