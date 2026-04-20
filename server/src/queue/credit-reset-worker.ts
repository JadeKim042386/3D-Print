/**
 * credit-reset-worker.ts
 *
 * BullMQ worker that resets credits_used to 0 for all free-tier users.
 * Intended to run once a month, scheduled by a cron trigger.
 *
 * Schedule: 00:00 on the 1st of each month (Asia/Seoul)
 *   Cron: "0 0 1 * *"
 *
 * To enqueue manually (e.g. in server.ts startup for scheduling):
 *   queue.add("monthly-reset", { scheduledAt: new Date().toISOString() }, {
 *     repeat: { pattern: "0 0 1 * *", tz: "Asia/Seoul" },
 *     jobId:  "monthly-credit-reset",
 *   });
 */

import { Worker, Queue, type ConnectionOptions } from "bullmq";
import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.js";
import { resetFreeCredits } from "../lib/credits.js";
import {
  CREDIT_RESET_QUEUE_NAME,
  type CreditResetJobData,
  type CreditResetJobResult,
} from "./credit-reset-queue.js";

export interface CreditResetWorkerDeps {
  connection: ConnectionOptions;
  supabase: SupabaseClient<Database>;
}

export function createCreditResetWorker(
  deps: CreditResetWorkerDeps
): Worker<CreditResetJobData, CreditResetJobResult> {
  const { connection, supabase } = deps;

  const worker = new Worker<CreditResetJobData, CreditResetJobResult>(
    CREDIT_RESET_QUEUE_NAME,
    async (job) => {
      await job.updateProgress(10);

      const usersReset = await resetFreeCredits(supabase);
      await job.updateProgress(100);

      const result: CreditResetJobResult = {
        usersReset,
        completedAt: new Date().toISOString(),
      };

      console.info(
        `[credit-reset] Monthly reset completed: ${usersReset} users reset.`
      );

      return result;
    },
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    Sentry.captureException(error, {
      tags: { queue: CREDIT_RESET_QUEUE_NAME, jobId: job?.id },
    });
    console.error("[credit-reset] Job failed:", error.message);
  });

  return worker;
}

/**
 * Register the monthly cron repeat on the queue.
 * Call once at application startup.
 */
export async function scheduleMonthlyCreditReset(
  queue: Queue<CreditResetJobData, CreditResetJobResult>
): Promise<void> {
  await queue.add(
    "monthly-reset",
    { scheduledAt: new Date().toISOString() },
    {
      repeat:  { pattern: "0 0 1 * *", tz: "Asia/Seoul" },
      jobId:   "monthly-credit-reset",
      removeOnComplete: { count: 5 },
      removeOnFail:     { count: 10 },
    }
  );
}
