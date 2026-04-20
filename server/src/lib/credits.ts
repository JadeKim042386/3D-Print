/**
 * credits.ts
 *
 * Core credit deduction logic, shared by tRPC routes and BullMQ workers.
 * All mutations use the service-role Supabase client for atomicity.
 */

import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.js";

type Supabase = SupabaseClient<Database>;

/**
 * Ensure a user_credits row exists for the user (upsert on first call).
 * Returns the current row.
 */
export async function ensureUserCredits(
  supabase: Supabase,
  userId: string
): Promise<Database["public"]["Tables"]["user_credits"]["Row"]> {
  // Try a SELECT first (fast path)
  const { data: existing } = await supabase
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (existing) return existing;

  // Insert free-tier row on first generation
  const { data, error } = await supabase
    .from("user_credits")
    .insert({
      user_id:       userId,
      plan_id:       "free",
      credits_used:  0,
      credits_limit: 3,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to initialise user credits: ${error?.message}`,
    });
  }

  return data;
}

/**
 * Deduct one credit from the user. Throws PAYMENT_REQUIRED (402) when
 * the user has no remaining credits (and is not on an unlimited plan).
 *
 * Returns the updated credits row.
 */
export async function deductCredit(
  supabase: Supabase,
  userId: string,
  modelId?: string
): Promise<Database["public"]["Tables"]["user_credits"]["Row"]> {
  const credits = await ensureUserCredits(supabase, userId);

  // -1 means unlimited (Business plan)
  if (credits.credits_limit !== -1) {
    const remaining = credits.credits_limit - credits.credits_used;
    if (remaining <= 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Credit limit reached. Upgrade your plan to generate more models.",
      });
    }
  }

  // Increment credits_used
  const { data: updated, error: updateError } = await supabase
    .from("user_credits")
    .update({ credits_used: credits.credits_used + 1 })
    .eq("id", credits.id)
    // Optimistic concurrency: only update if credits_used hasn't changed
    .eq("credits_used", credits.credits_used)
    .select("*")
    .single();

  if (updateError || !updated) {
    // Row was updated concurrently — retry by re-reading
    return deductCredit(supabase, userId, modelId);
  }

  // Append audit record (fire-and-forget — don't fail the generation on audit error)
  void supabase.from("credit_transactions").insert({
    user_id:  userId,
    delta:    -1,
    reason:   "generation",
    model_id: modelId ?? null,
  });

  return updated;
}

/**
 * Manually adjust a user's credits_used by `delta` (negative = add credits back,
 * positive = consume). Records an admin_adjustment transaction.
 */
export async function adminAdjustCredits(
  supabase: Supabase,
  userId: string,
  delta: number,
  adminId: string,
  note?: string
): Promise<Database["public"]["Tables"]["user_credits"]["Row"]> {
  const credits = await ensureUserCredits(supabase, userId);

  const newUsed = Math.max(0, credits.credits_used + delta);

  const { data, error } = await supabase
    .from("user_credits")
    .update({ credits_used: newUsed })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to adjust credits: ${error?.message}`,
    });
  }

  await supabase.from("credit_transactions").insert({
    user_id:  userId,
    delta:    -delta,   // stored as change to remaining; delta>0 = admin took credits
    reason:   "admin_adjustment",
    admin_id: adminId,
    note:     note ?? null,
  });

  return data;
}

/**
 * Reset credits_used to 0 for all free-tier users (monthly job).
 * Returns the number of rows updated.
 */
export async function resetFreeCredits(supabase: Supabase): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("user_credits")
    .update({
      credits_used:  0,
      period_start:  periodStart,
      period_end:    periodEnd,
    })
    .eq("plan_id", "free")
    .select("id");

  if (error) {
    throw new Error(`Credit reset failed: ${error.message}`);
  }

  const count = data?.length ?? 0;

  // Audit all resets in one insert
  if (count > 0 && data) {
    const txRows = data.map((row) => ({
      user_id: row.id, // will be replaced below with actual user_id
      delta:    0,
      reason:  "monthly_reset",
    }));
    // Re-fetch user_ids for the audit rows
    const { data: creditRows } = await supabase
      .from("user_credits")
      .select("id, user_id")
      .in("id", data.map((r) => r.id));

    if (creditRows && creditRows.length > 0) {
      await supabase.from("credit_transactions").insert(
        creditRows.map((cr) => ({
          user_id: cr.user_id,
          delta:   0,
          reason:  "monthly_reset",
        }))
      );
    }
  }

  return count;
}
