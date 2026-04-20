/**
 * generate.ts
 *
 * tRPC router for Meshy AI text-to-3D generation.
 * Dimension-based generation is a separate route: dimensionGenerate.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";
import { deductCredit } from "../lib/credits.js";

export const generateRouter = router({
  /** Enqueue a Meshy AI text-to-3D generation job */
  generate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Enforce credit limit before creating the model record
      await deductCredit(ctx.supabase, ctx.user.id);

      const { data: model, error } = await ctx.supabase
        .from("models")
        .insert({
          prompt:  input.prompt,
          status:  "queued",
          user_id: ctx.user.id,
        })
        .select("id")
        .single();

      if (error || !model) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create model record: ${error?.message}`,
        });
      }

      if (!ctx.generationQueue) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI generation queue unavailable — Redis not connected",
        });
      }

      const job = await ctx.generationQueue.add("text-to-3d", {
        modelId: model.id,
        prompt:  input.prompt,
      });

      return {
        modelId: model.id,
        jobId:   job.id,
        status:  "queued" as const,
      };
    }),

  /** Poll AI generation model status */
  getModel: protectedProcedure
    .input(z.object({ modelId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("models")
        .select("*")
        .eq("id", input.modelId)
        .eq("user_id", ctx.user.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      return data;
    }),
});

export type GenerateRouter = typeof generateRouter;
