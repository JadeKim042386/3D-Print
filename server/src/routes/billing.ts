/**
 * billing.ts
 *
 * tRPC router exposing subscription plan info and per-user credit state.
 * Mutation endpoints (Toss Payments subscription) are gated behind DPR-24.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";
import { ensureUserCredits } from "../lib/credits.js";

export const billingRouter = router({
  /** List all subscription plans */
  getPlans: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("subscription_plans")
      .select("*")
      .order("price_krw", { ascending: true });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch plans: ${error.message}`,
      });
    }

    return data ?? [];
  }),

  /** Get the calling user's current credit balance and plan */
  getCredits: protectedProcedure.query(async ({ ctx }) => {
    const credits = await ensureUserCredits(ctx.supabase, ctx.user!.id);

    const { data: plan } = await ctx.supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", credits.plan_id)
      .single();

    const remaining =
      credits.credits_limit === -1
        ? null  // unlimited
        : credits.credits_limit - credits.credits_used;

    return {
      planId:       credits.plan_id,
      plan:         plan ?? null,
      creditsUsed:  credits.credits_used,
      creditsLimit: credits.credits_limit,
      remaining,
      periodStart:  credits.period_start,
      periodEnd:    credits.period_end,
    };
  }),
});

export type BillingRouter = typeof billingRouter;
