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
import { computeRefitDimensions } from "../lib/dimension-refit.js";

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

  /**
   * Refit an existing dimension-generated model with new dimensions.
   *
   * The user provides partial or full dimension updates. Omitted dimensions
   * are auto-computed to preserve the original aspect ratio (proportional refit).
   *
   * - Parametric models: regenerated from scratch (free, deterministic)
   * - AI models: existing mesh is downloaded and proportionally rescaled
   *
   * Returns a NEW model record (the original is preserved).
   */
  refit: protectedProcedure
    .input(
      z.object({
        /** ID of the model to refit */
        modelId: z.string().uuid(),
        /** Partial dimension updates — omitted fields preserve aspect ratio */
        dimensions: z.object({
          width_mm:  z.number().min(1).max(2000).optional(),
          height_mm: z.number().min(1).max(2000).optional(),
          depth_mm:  z.number().min(1).max(2000).optional(),
        }).refine(
          (d) => d.width_mm != null || d.height_mm != null || d.depth_mm != null,
          { message: "At least one dimension must be provided" }
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the original model
      const { data: source, error: fetchError } = await ctx.supabase
        .from("models")
        .select("*")
        .eq("id", input.modelId)
        .eq("user_id", ctx.user.id)
        .single();

      if (fetchError || !source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source model not found" });
      }

      if (source.status !== "ready" || !source.file_url) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Source model is not ready for refitting",
        });
      }

      // Must have original dimensions to compute proportional refit
      if (!source.width_mm || !source.height_mm || !source.depth_mm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Source model has no dimension data — cannot refit",
        });
      }

      const genType = source.generation_type as "parametric" | "dimension_aware_ai" | null;
      if (!genType || genType === "ai" as string) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only dimension-generated models (parametric or dimension_aware_ai) can be refitted",
        });
      }

      // 2. Compute proportionally adjusted dimensions
      const refitResult = computeRefitDimensions({
        original: {
          width_mm:  source.width_mm,
          height_mm: source.height_mm,
          depth_mm:  source.depth_mm,
        },
        updated: input.dimensions,
      });

      const newDims = refitResult.dimensions;

      // 3. Create new model record
      const { data: newModel, error: insertError } = await ctx.supabase
        .from("models")
        .insert({
          prompt:       source.prompt,
          status:       "queued",
          user_id:      ctx.user.id,
          width_mm:     newDims.width_mm,
          height_mm:    newDims.height_mm,
          depth_mm:     newDims.depth_mm,
          scaling_mode: source.scaling_mode ?? "proportional",
        })
        .select("id")
        .single();

      if (insertError || !newModel) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create refit model record: ${insertError?.message}`,
        });
      }

      if (!ctx.dimensionQueue) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dimension generation service unavailable — Redis not connected",
        });
      }

      // 4. Enqueue refit job
      const sourceFormat = (source.format === "stl" || source.format === "glb")
        ? source.format
        : "glb";

      const job = await ctx.dimensionQueue.add("dimension-refit", {
        modelId:    newModel.id,
        prompt:     source.prompt,
        dimensions: {
          width_mm:  newDims.width_mm,
          height_mm: newDims.height_mm,
          depth_mm:  newDims.depth_mm,
          mode:      (source.scaling_mode as "proportional" | "exact") ?? "proportional",
        },
        refit: {
          sourceModelId:        source.id,
          sourceFileUrl:        source.file_url,
          sourceFormat,
          sourceGenerationType: genType,
        },
      });

      return {
        modelId:        newModel.id,
        jobId:          job.id,
        status:         "queued" as const,
        queueName:      "dimension-generation",
        sourceModelId:  source.id,
        uniformScale:   refitResult.uniformScale,
        refittedDimensions: newDims,
      };
    }),
});

export type DimensionGenerateRouter = typeof dimensionGenerateRouter;
