/**
 * generation-worker.ts
 *
 * BullMQ worker for Meshy AI text-to-3D generation.
 * Handles jobs from the "generation" queue only.
 *
 * For dimension-based generation use the separate dimension-worker service.
 */

import { Worker, type Job, type ConnectionOptions } from "bullmq";
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

interface HomefixRenderJobData {
  homefixRenderJobId: string;
  projectId: string;
  userId: string;
  cameraPreset: string;
  snapshot: {
    room_type: string;
    room_width_mm: number;
    room_depth_mm: number;
    room_height_mm: number;
    placements: Array<{
      furniture_catalog?: { name_en?: string };
    }>;
  };
}

function buildRenderPrompt(snapshot: HomefixRenderJobData["snapshot"], cameraPreset: string): string {
  const { room_type, room_width_mm, room_depth_mm, room_height_mm, placements } = snapshot;
  const w = (room_width_mm / 1000).toFixed(1);
  const d = (room_depth_mm / 1000).toFixed(1);
  const h = (room_height_mm / 1000).toFixed(1);
  const furniture = placements
    .map((p) => p.furniture_catalog?.name_en ?? "furniture piece")
    .join(", ") || "empty room";
  const cameraDesc: Record<string, string> = {
    top: "top-down floor plan view",
    perspective: "perspective view",
    corner_ne: "corner view from northeast",
    corner_nw: "corner view from northwest",
    corner_se: "corner view from southeast",
    corner_sw: "corner view from southwest",
  };
  return (
    `Photorealistic interior render of a ${room_type} room, ` +
    `${w}m wide × ${d}m deep × ${h}m tall. ` +
    `Furniture: ${furniture}. ` +
    `Camera: ${cameraDesc[cameraPreset] ?? "perspective view"}. ` +
    `Architectural visualization, professional lighting, high detail.`
  );
}

const RENDERS_BUCKET = "renders";

async function handleHomefixRender(
  deps: GenerationWorkerDeps,
  job: Job<HomefixRenderJobData>
): Promise<void> {
  const { supabase, provider } = deps;
  const { homefixRenderJobId, projectId, cameraPreset, snapshot } = job.data;

  await supabase.from("homefix_render_jobs").update({
    status: "processing",
    started_at: new Date().toISOString(),
  }).eq("id", homefixRenderJobId);
  await job.updateProgress(10);

  const prompt = buildRenderPrompt(snapshot, cameraPreset);
  const { providerTaskId } = await provider.createTask({ prompt });

  await supabase.from("homefix_render_jobs").update({
    provider_task_id: providerTaskId,
    provider: provider.name,
  }).eq("id", homefixRenderJobId);
  await job.updateProgress(20);

  const result = await provider.waitForCompletion(providerTaskId, {
    pollIntervalMs: 5000,
    timeoutMs: 600_000,
  });
  await job.updateProgress(80);

  // Prefer the thumbnail (JPEG image); fall back to a 1×1 PNG placeholder so
  // the mock provider (which returns no thumbnail) still completes successfully.
  const PLACEHOLDER_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const imageUrl = result.thumbnailUrl ?? PLACEHOLDER_PNG;
  const ext = result.thumbnailUrl ? "jpg" : "png";
  const storagePath = `${homefixRenderJobId}/${providerTaskId}.${ext}`;
  const resultUrl = await uploadToStorage(supabase, RENDERS_BUCKET, storagePath, imageUrl);
  await job.updateProgress(95);

  await supabase.from("homefix_render_jobs").update({
    status: "completed",
    result_url: resultUrl,
    error_message: null,
    completed_at: new Date().toISOString(),
  }).eq("id", homefixRenderJobId);

  await supabase.from("homefix_staging_projects").update({ status: "ready" }).eq("id", projectId);

  await job.updateProgress(100);
}

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
      if (job.name === "homefix-render") {
        await handleHomefixRender(deps, job as unknown as Job<HomefixRenderJobData>);
        return { modelId: "", storageUrl: "", providerTaskId: "" };
      }

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
      tags: { queue: GENERATION_QUEUE_NAME, jobId: job?.id, jobName: job?.name },
      extra: { attemptsMade: job?.attemptsMade },
    });

    if (!job) return;

    if (job.name === "homefix-render") {
      const { homefixRenderJobId, projectId } = job.data as unknown as HomefixRenderJobData;
      await supabase.from("homefix_render_jobs").update({
        status: "failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }).eq("id", homefixRenderJobId);
      await supabase.from("homefix_staging_projects").update({ status: "ready" }).eq("id", projectId);
    } else {
      await supabase.from("models").update({
        status:        "failed",
        error_message: error.message,
      }).eq("id", job.data.modelId);
    }
  });

  return worker;
}
