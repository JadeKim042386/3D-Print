import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Queue } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GenerationJobData,
  GenerationJobResult,
} from "../queue/generation-queue.js";

export interface RouterContext {
  supabase: SupabaseClient;
  generationQueue: Queue<GenerationJobData, GenerationJobResult>;
}

const t = initTRPC.context<RouterContext>().create();

export const generateRouter = t.router({
  /** Enqueue a text-to-3D generation job */
  generate: t.procedure
    .input(
      z.object({
        prompt: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create model record
      const { data: model, error } = await ctx.supabase
        .from("models")
        .insert({
          prompt: input.prompt,
          status: "queued",
        })
        .select("id")
        .single();

      if (error || !model) {
        throw new Error(`Failed to create model record: ${error?.message}`);
      }

      // Enqueue the generation job
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

  /** Get model status */
  getModel: t.procedure
    .input(z.object({ modelId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("models")
        .select("*")
        .eq("id", input.modelId)
        .single();

      if (error || !data) {
        throw new Error(`Model not found: ${input.modelId}`);
      }

      return data;
    }),
});

export type GenerateRouter = typeof generateRouter;
