/**
 * print-readiness-worker.ts
 *
 * BullMQ worker for print-readiness validation.
 * Runs after generation or dimension workers complete.
 *
 * Flow:
 *   1. Download model from storage URL
 *   2. Analyze print-readiness (watertight, manifold, normals, wall thickness)
 *   3. If repairable (inverted normals) → repair → re-upload → re-analyze
 *   4. Persist print_quality_score and print_ready to DB
 *   5. If score < 60 and retryCount < 1 → flag for manual review
 */

import { Worker, type ConnectionOptions, type Queue } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePrintReadiness } from "../lib/print-readiness.js";
import { repairStlMesh } from "../lib/mesh-repair.js";
import {
  PRINT_READINESS_QUEUE_NAME,
  type PrintReadinessJobData,
  type PrintReadinessJobResult,
} from "./print-readiness-queue.js";

export interface PrintReadinessWorkerDeps {
  connection: ConnectionOptions;
  supabase: SupabaseClient;
  bucket: string;
}

export function createPrintReadinessWorker(
  deps: PrintReadinessWorkerDeps,
): Worker<PrintReadinessJobData, PrintReadinessJobResult> {
  const { connection, supabase, bucket } = deps;

  const worker = new Worker<PrintReadinessJobData, PrintReadinessJobResult>(
    PRINT_READINESS_QUEUE_NAME,
    async (job) => {
      const { modelId, fileUrl, format } = job.data;
      const retryCount = job.data.retryCount ?? 0;

      await job.updateProgress(10);

      // Step 1: Download model from storage
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      let modelBuffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer));

      await job.updateProgress(30);

      // Step 2: Analyze print-readiness
      let report = analyzePrintReadiness(modelBuffer, format);
      let repairsApplied: string[] = [];

      await job.updateProgress(50);

      // Step 3: Attempt repair if STL with fixable issues
      if (format === "stl" && !report.hasConsistentNormals && report.invertedNormalCount > 0) {
        const repairResult = repairStlMesh(modelBuffer);

        if (repairResult.normalsFlipped > 0) {
          modelBuffer = repairResult.buffer;
          repairsApplied = repairResult.repairsApplied;

          // Re-upload repaired model
          const repairedPath = fileUrl.includes("/")
            ? fileUrl.split("/").slice(-2).join("/").replace(/\.[^.]+$/, `-repaired.${format}`)
            : `${modelId}/repaired.${format}`;

          const contentType = "model/stl";
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(repairedPath, modelBuffer, { contentType, upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(repairedPath);

            await supabase.from("models").update({
              file_url: urlData.publicUrl,
            }).eq("id", modelId);
          }

          // Re-analyze after repair
          report = analyzePrintReadiness(modelBuffer, format);
        }
      }

      await job.updateProgress(80);

      // Step 4: Persist results
      const updateData: Record<string, unknown> = {
        print_quality_score: report.printQualityScore,
        print_ready: report.printReady,
      };

      // If score is very low after retry, flag for manual review
      if (report.printQualityScore < 60 && retryCount >= 1) {
        updateData.error_message = `Print-readiness check failed (score: ${report.printQualityScore}/100). Issues: ${report.issues.join("; ")}`;
      }

      await supabase.from("models").update(updateData).eq("id", modelId);

      await job.updateProgress(100);

      return {
        modelId,
        printQualityScore: report.printQualityScore,
        printReady: report.printReady,
        repairsApplied,
      };
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("failed", async (job, error) => {
    Sentry.captureException(error, {
      tags: {
        queue: PRINT_READINESS_QUEUE_NAME,
        jobId: job?.id,
        modelId: job?.data.modelId,
      },
    });

    if (job) {
      await supabase.from("models").update({
        print_quality_score: 0,
        print_ready: false,
        error_message: `Print-readiness validation failed: ${error.message}`,
      }).eq("id", job.data.modelId);
    }
  });

  return worker;
}
