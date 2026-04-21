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
import type { Mailer } from "../lib/mailer.js";

export interface CreditResetWorkerDeps {
  connection: ConnectionOptions;
  supabase: SupabaseClient<Database>;
  /** Optional: send subscription renewal reminder emails */
  mailer?: Mailer | null;
}

export function createCreditResetWorker(
  deps: CreditResetWorkerDeps
): Worker<CreditResetJobData, CreditResetJobResult> {
  const { connection, supabase, mailer } = deps;

  const worker = new Worker<CreditResetJobData, CreditResetJobResult>(
    CREDIT_RESET_QUEUE_NAME,
    async (job) => {
      const jobType = job.data.jobType ?? "monthly-reset";
      await job.updateProgress(10);

      if (jobType === "renewal-check") {
        // Find paid-plan users whose period_end is exactly 3 days from now
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const targetDate = threeDaysFromNow.toISOString().slice(0, 10); // YYYY-MM-DD

        const { data: upcoming } = await supabase
          .from("user_credits")
          .select("user_id, plan_id, period_end")
          .neq("plan_id", "free")
          .eq("period_end", targetDate);

        await job.updateProgress(50);

        let reminderssent = 0;

        if (mailer && upcoming && upcoming.length > 0) {
          const userIds = upcoming.map((r) => r.user_id);
          const { data: users } = await supabase
            .from("users")
            .select("id, email, display_name")
            .in("id", userIds);

          const userMap = new Map(
            (users ?? []).map((u) => [u.id, u])
          );

          await Promise.all(
            upcoming.map(async (row) => {
              const user = userMap.get(row.user_id);
              if (!user?.email || !row.period_end) return;
              try {
                await mailer.sendSubscriptionRenewal({
                  to: user.email,
                  planId: row.plan_id,
                  renewalDate: row.period_end,
                  displayName: user.display_name ?? undefined,
                });
                reminderssent++;
              } catch (err) {
                console.error(
                  `[credit-reset] Failed to send renewal reminder to ${user.email}:`,
                  (err as Error).message
                );
              }
            })
          );
        }

        await job.updateProgress(100);

        console.info(
          `[credit-reset] Renewal check: ${reminderssent} reminders sent for ${targetDate}.`
        );

        return { reminderssent, completedAt: new Date().toISOString() };
      }

      // Default: monthly credit reset
      const usersReset = await resetFreeCredits(supabase);
      await job.updateProgress(100);

      console.info(
        `[credit-reset] Monthly reset completed: ${usersReset} users reset.`
      );

      return { usersReset, completedAt: new Date().toISOString() };
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
    { scheduledAt: new Date().toISOString(), jobType: "monthly-reset" },
    {
      repeat:  { pattern: "0 0 1 * *", tz: "Asia/Seoul" },
      jobId:   "monthly-credit-reset",
      removeOnComplete: { count: 5 },
      removeOnFail:     { count: 10 },
    }
  );
}

/**
 * Register the daily subscription renewal reminder check on the queue.
 * Runs at 09:00 KST every day, checks for users whose period_end is 3 days away.
 * Call once at application startup.
 */
export async function scheduleDailyRenewalCheck(
  queue: Queue<CreditResetJobData, CreditResetJobResult>
): Promise<void> {
  await queue.add(
    "renewal-check",
    { scheduledAt: new Date().toISOString(), jobType: "renewal-check" },
    {
      repeat:  { pattern: "0 9 * * *", tz: "Asia/Seoul" },
      jobId:   "daily-renewal-check",
      removeOnComplete: { count: 7 },
      removeOnFail:     { count: 14 },
    }
  );
}
