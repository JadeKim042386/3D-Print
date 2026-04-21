/**
 * credit-reset-queue.ts
 *
 * BullMQ queue definition for monthly free-tier credit resets.
 * The queue is processed by the credit-reset-worker.
 */

import { Queue, type ConnectionOptions } from "bullmq";

export const CREDIT_RESET_QUEUE_NAME = "credit-reset" as const;

export interface CreditResetJobData {
  /** ISO timestamp when the job was scheduled (for logging) */
  scheduledAt: string;
  /** Discriminates between monthly credit reset and daily renewal reminder check */
  jobType?: "monthly-reset" | "renewal-check";
}

export interface CreditResetJobResult {
  usersReset?: number;
  reminderssent?: number;
  completedAt: string;
}

export type CreditResetQueue = Queue<CreditResetJobData, CreditResetJobResult>;

export function createCreditResetQueue(
  connection: ConnectionOptions
): CreditResetQueue {
  return new Queue<CreditResetJobData, CreditResetJobResult>(
    CREDIT_RESET_QUEUE_NAME,
    { connection }
  );
}
