import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";

const dimensionSchema = z
  .object({
    width_mm:  z.number().min(1).max(2000),
    height_mm: z.number().min(1).max(2000),
    depth_mm:  z.number().min(1).max(2000),
    mode: z.enum(["proportional", "exact"]).optional().default("proportional"),
  })
  .optional();

export const generateRouter = router({
  /** Enqueue a text-to-3D generation job */
  generate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(500),
        /**
         * Optional physical dimensions (mm). When provided, the generated mesh
         * will be post-processed to match the requested W×H×D exactly.
         */
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
          width_mm:     input.dimensions?.width_mm  ?? null,
          height_mm:    input.dimensions?.height_mm ?? null,
          depth_mm:     input.dimensions?.depth_mm  ?? null,
          scaling_mode: input.dimensions?.mode      ?? null,
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
          message: "Generation queue unavailable — Redis not connected",
        });
      }

      const job = await ctx.generationQueue.add("text-to-3d", {
        modelId:    model.id,
        prompt:     input.prompt,
        dimensions: input.dimensions,
      });

      return {
        modelId: model.id,
        jobId:   job.id,
        status:  "queued" as const,
      };
    }),

  /** Poll model status — includes dimension accuracy when available */
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

      // Build structured dimensions sub-object when dimension data is present
      const dimensions =
        data.width_mm != null
          ? {
              requested: {
                width_mm:  data.width_mm,
                height_mm: data.height_mm,
                depth_mm:  data.depth_mm,
              },
              actual:
                data.actual_width_mm != null
                  ? {
                      width_mm:  data.actual_width_mm,
                      height_mm: data.actual_height_mm,
                      depth_mm:  data.actual_depth_mm,
                    }
                  : null,
              accuracy_pct:  data.dimensional_accuracy_pct ?? null,
              scaling_mode:  data.scaling_mode ?? null,
            }
          : null;

      return { ...data, dimensions };
    }),
});

export type GenerateRouter = typeof generateRouter;
