/**
 * dimension-generate.ts
 *
 * tRPC router for dimension-based 3D generation.
 * Completely separate from the Meshy AI generation route (generate.ts).
 *
 * This router enqueues jobs to the dimension-generation queue, which is
 * processed by the standalone dimension-worker service.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";

const dimensionSchema = z.object({
  width_mm:  z.number().min(1).max(2000),
  height_mm: z.number().min(1).max(2000),
  depth_mm:  z.number().min(1).max(2000),
  mode: z.enum(["proportional", "exact"]).optional().default("proportional"),
});

export const dimensionGenerateRouter = router({
  /**
   * Enqueue a dimension-based 3D generation job.
   *
   * The service automatically selects the best generation strategy:
   *   - Geometric shapes (box, cylinder, bracket, …) → parametric CSG (0 mm error)
   *   - Organic shapes (mug, animal, figurine, …) → dimension-aware AI generation
   *
   * dimensions is required — if no dimensions are needed, use the AI
   * generation route (generate.generate) instead.
   */
  generate: protectedProcedure
    .input(
      z.object({
        prompt:     z.string().min(1).max(500),
        dimensions: dimensionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: model, error } = await ctx.supabase
        .from("models")
        .insert({
          prompt:       input.prompt,
          status:       "queued",
          user_id:      ctx.user.id,
          width_mm:     input.dimensions.width_mm,
          height_mm:    input.dimensions.height_mm,
          depth_mm:     input.dimensions.depth_mm,
          scaling_mode: input.dimensions.mode,
        })
        .select("id")
        .single();

      if (error || !model) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create model record: ${error?.message}`,
        });
      }

      if (!ctx.dimensionQueue) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dimension generation service unavailable — Redis not connected",
        });
      }

      const job = await ctx.dimensionQueue.add("dimension-3d", {
        modelId:    model.id,
        prompt:     input.prompt,
        dimensions: input.dimensions,
      });

      return {
        modelId:   model.id,
        jobId:     job.id,
        status:    "queued" as const,
        queueName: "dimension-generation",
      };
    }),

  /** Poll dimension generation job status — includes accuracy metrics */
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

      return {
        ...data,
        dimensions: {
          requested: {
            width_mm:  data.width_mm,
            height_mm: data.height_mm,
            depth_mm:  data.depth_mm,
          },
          actual: data.actual_width_mm != null
            ? {
                width_mm:  data.actual_width_mm,
                height_mm: data.actual_height_mm,
                depth_mm:  data.actual_depth_mm,
              }
            : null,
          accuracy_pct:    data.dimensional_accuracy_pct ?? null,
          generation_type: data.generation_type ?? null,
        },
      };
    }),
});

export type DimensionGenerateRouter = typeof dimensionGenerateRouter;
