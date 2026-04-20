import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, consentedProcedure } from "../trpc/trpc.js";

export const modelsRouter = router({
  /** Create a new model (enqueue generation) — requires PIPA consents */
  create: consentedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: model, error } = await ctx.supabase
        .from("models")
        .insert({
          user_id: ctx.user.id,
          prompt: input.prompt,
          status: "queued",
        })
        .select("id")
        .single();

      if (error || !model) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create model: ${error?.message}`,
        });
      }

      // Enqueue the generation job
      if (!ctx.generationQueue) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Generation queue unavailable — Redis not connected",
        });
      }
      const job = await ctx.generationQueue.add("text-to-3d", {
        modelId: model.id,
        prompt: input.prompt,
      });

      return {
        modelId: model.id,
        jobId: job.id,
        status: "queued" as const,
      };
    }),

  /** Get a model by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("models")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", ctx.user.id)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Model not found: ${input.id}`,
        });
      }

      return data;
    }),

  /** List models for the authenticated user */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error, count } = await ctx.supabase
        .from("models")
        .select("*", { count: "exact" })
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list models: ${error.message}`,
        });
      }

      return { models: data ?? [], total: count ?? 0 };
    }),

  /** Delete a model */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("models")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete model: ${error.message}`,
        });
      }

      return { success: true };
    }),
});
