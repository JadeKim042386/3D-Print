/**
 * credit-reset-queue.ts
 *
 * BullMQ queue definition for monthly free-tier credit resets.
 * The queue is processed by the credit-reset-worker.
 */

import type { Queue } from "bullmq";

export const CREDIT_RESET_QUEUE_NAME = "credit-reset" as const;

export interface CreditResetJobData {
  /** ISO timestamp when the job was scheduled (for logging) */
  scheduledAt: string;
}

export interface CreditResetJobResult {
  usersReset: number;
  completedAt: string;
}

export type CreditResetQueue = Queue<CreditResetJobData, CreditResetJobResult>;
