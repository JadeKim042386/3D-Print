/**
 * HomeFix render job orchestration.
 *
 * Queues photorealistic staging renders, tracks status, delivers results,
 * and enforces per-user render quotas (metering).
 *
 * The actual render work is handled by the generation worker (BullMQ).
 * We reuse the existing generationQueue — jobs carry a `type: 'homefix-render'`
 * discriminant so the worker can route them to the right handler.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";

const CAMERA_PRESETS = [
  "top", "perspective", "corner_ne", "corner_nw", "corner_se", "corner_sw",
] as const;

/** Returns the billing period start date (first of current month, UTC). */
function currentPeriodStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function getRenderUsage(
  supabase: any,
  userId: string
): Promise<{ renders_used: number; renders_limit: number }> {
  const period = currentPeriodStart();
  const { data } = await supabase
    .from("homefix_usage")
    .select("renders_used, renders_limit")
    .eq("user_id", userId)
    .eq("period_start", period)
    .single();

  return data ?? { renders_used: 0, renders_limit: 5 };
}

async function incrementRenderUsage(supabase: any, userId: string): Promise<void> {
  const period = currentPeriodStart();
  // Upsert — increment if row exists, create with renders_used = 1 if not
  await supabase.rpc("homefix_increment_render_usage", {
    p_user_id:      userId,
    p_period_start: period,
  });
}

export const homefixRenderRouter = router({
  /** Trigger a photorealistic render for a staging project */
  trigger: protectedProcedure
    .input(
      z.object({
        project_id:    z.string().uuid(),
        camera_preset: z.enum(CAMERA_PRESETS).default("perspective"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1 — quota check
      const usage = await getRenderUsage(ctx.supabase, ctx.user.id);
      if (usage.renders_used >= usage.renders_limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `월 렌더 한도(${usage.renders_limit}회)를 초과했습니다. 플랜을 업그레이드해 주세요.`,
        });
      }

      // 2 — verify project ownership + load placements
      const { data: project } = await ctx.supabase
        .from("homefix_staging_projects")
        .select("*, homefix_placements(*, furniture_catalog(*))")
        .eq("id", input.project_id)
        .eq("user_id", ctx.user.id)
        .single();

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staging project not found" });
      }

      // 3 — create render job record
      const snapshot = {
        room_type:      project.room_type,
        room_width_mm:  project.room_width_mm,
        room_depth_mm:  project.room_depth_mm,
        room_height_mm: project.room_height_mm,
        l_width_mm:     project.l_width_mm,
        l_depth_mm:     project.l_depth_mm,
        placements:     (project as any).homefix_placements ?? [],
      };

      const { data: job, error: jobError } = await ctx.supabase
        .from("homefix_render_jobs")
        .insert({
          project_id:       input.project_id,
          user_id:          ctx.user.id,
          status:           "queued",
          camera_preset:    input.camera_preset,
          staging_snapshot: snapshot,
        })
        .select("id")
        .single();

      if (jobError || !job) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create render job: ${jobError?.message}`,
        });
      }

      // 4 — mark project as rendering
      await ctx.supabase
        .from("homefix_staging_projects")
        .update({ status: "rendering" })
        .eq("id", input.project_id);

      // 5 — enqueue in BullMQ (falls back to DB-only if queue unavailable)
      if (ctx.generationQueue) {
        try {
          const bullJob = await ctx.generationQueue.add("homefix-render", {
            homefixRenderJobId: job.id,
            projectId:          input.project_id,
            userId:             ctx.user.id,
            cameraPreset:       input.camera_preset,
            snapshot,
          } as any);
          console.log(`[homefix-render] enqueued BullMQ job id: ${bullJob.id}`);
        } catch (enqueueErr) {
          console.error(`[homefix-render] BullMQ enqueue failed — job ${job.id} queued in DB only:`, (enqueueErr as Error).message);
        }
      } else {
        console.warn("[homefix-render] generationQueue unavailable — job queued in DB only");
      }

      // 6 — increment metering
      await incrementRenderUsage(ctx.supabase, ctx.user.id);
      await ctx.supabase
        .from("homefix_staging_projects")
        .update({ render_count: (project.render_count ?? 0) + 1 })
        .eq("id", input.project_id);

      return {
        jobId:     job.id,
        projectId: input.project_id,
        status:    "queued" as const,
      };
    }),

  /** Get render job status and result URL */
  status: protectedProcedure
    .input(z.object({ job_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("homefix_render_jobs")
        .select("*")
        .eq("id", input.job_id)
        .eq("user_id", ctx.user.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Render job not found: ${input.job_id}` });
      }

      return data;
    }),

  /** List render jobs for a project */
  listByProject: protectedProcedure
    .input(
      z.object({
        project_id: z.string().uuid(),
        limit:      z.number().int().min(1).max(50).default(10),
        offset:     z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error, count } = await ctx.supabase
        .from("homefix_render_jobs")
        .select("*", { count: "exact" })
        .eq("project_id", input.project_id)
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { jobs: data ?? [], total: count ?? 0 };
    }),

  /** Get render usage quota for the current billing period */
  usage: protectedProcedure.query(async ({ ctx }) => {
    const usage = await getRenderUsage(ctx.supabase, ctx.user.id);
    return {
      ...usage,
      period_start:    currentPeriodStart(),
      renders_remaining: Math.max(0, usage.renders_limit - usage.renders_used),
    };
  }),
});
