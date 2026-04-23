import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";
import type { Json } from "../types/database.js";

const ROOM_TYPES = ["거실", "침실", "주방", "화장실", "발코니", "기타"] as const;

const PlacementInput = z.object({
  furniture_id:  z.string().uuid(),
  x_mm:          z.number().int(),
  y_mm:          z.number().int(),
  rotation_deg:  z.number().min(0).max(359.99).default(0),
  label:         z.string().max(80).optional(),
});

export const homefixStagingRouter = router({
  // ─── Staging project CRUD ───────────────────────────────────────────────────

  /** Create a new staging project (room) */
  create: protectedProcedure
    .input(
      z.object({
        name:           z.string().min(1).max(120).default("내 공간"),
        room_type:      z.enum(ROOM_TYPES),
        room_width_mm:  z.number().int().positive(),
        room_depth_mm:  z.number().int().positive(),
        room_height_mm: z.number().int().positive().default(2400),
        l_width_mm:     z.number().int().positive().optional(),
        l_depth_mm:     z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("homefix_staging_projects")
        .insert({
          user_id:        ctx.user.id,
          name:           input.name,
          room_type:      input.room_type,
          room_width_mm:  input.room_width_mm,
          room_depth_mm:  input.room_depth_mm,
          room_height_mm: input.room_height_mm,
          l_width_mm:     input.l_width_mm ?? null,
          l_depth_mm:     input.l_depth_mm ?? null,
          status:         "draft",
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create staging project: ${error?.message}`,
        });
      }

      return data;
    }),

  /** Get a staging project with its current placements */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [projectRes, placementsRes] = await Promise.all([
        ctx.supabase
          .from("homefix_staging_projects")
          .select("*")
          .eq("id", input.id)
          .eq("user_id", ctx.user.id)
          .single(),
        ctx.supabase
          .from("homefix_placements")
          .select("*, homefix_furniture(*)")
          .eq("project_id", input.id)
          .order("created_at"),
      ]);

      if (projectRes.error || !projectRes.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Staging project not found: ${input.id}` });
      }

      return {
        ...projectRes.data,
        placements: placementsRes.data ?? [],
      };
    }),

  /** List all staging projects for the authenticated user */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "rendering", "rendered", "archived"]).optional(),
        limit:  z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("homefix_staging_projects")
        .select("id, name, room_type, status, thumbnail_url, render_count, created_at, updated_at", { count: "exact" })
        .eq("user_id", ctx.user.id);

      if (input.status) query = query.eq("status", input.status);

      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { projects: data ?? [], total: count ?? 0 };
    }),

  /** Update room dimensions or metadata */
  update: protectedProcedure
    .input(
      z.object({
        id:             z.string().uuid(),
        name:           z.string().min(1).max(120).optional(),
        room_type:      z.enum(ROOM_TYPES).optional(),
        room_width_mm:  z.number().int().positive().optional(),
        room_depth_mm:  z.number().int().positive().optional(),
        room_height_mm: z.number().int().positive().optional(),
        l_width_mm:     z.number().int().positive().nullable().optional(),
        l_depth_mm:     z.number().int().positive().nullable().optional(),
        session_data:   z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, session_data, ...rest } = input;
      const fields = {
        ...rest,
        ...(session_data !== undefined ? { session_data: session_data as Json } : {}),
      };

      const { data, error } = await ctx.supabase
        .from("homefix_staging_projects")
        .update(fields)
        .eq("id", id)
        .eq("user_id", ctx.user.id)
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Staging project not found or update failed: ${error?.message}`,
        });
      }

      return data;
    }),

  /** Archive (soft-delete) a staging project */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("homefix_staging_projects")
        .update({ status: "archived" })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);

      if (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Staging project not found: ${input.id}` });
      }

      return { archived: true };
    }),

  // ─── Placement CRUD ─────────────────────────────────────────────────────────

  /** Add a furniture item to a staging project */
  addFurniture: protectedProcedure
    .input(z.object({ project_id: z.string().uuid() }).merge(PlacementInput))
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const { data: project } = await ctx.supabase
        .from("homefix_staging_projects")
        .select("id")
        .eq("id", input.project_id)
        .eq("user_id", ctx.user.id)
        .single();

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staging project not found" });
      }

      const { data, error } = await ctx.supabase
        .from("homefix_placements")
        .insert({
          project_id:   input.project_id,
          furniture_id: input.furniture_id,
          x_mm:         input.x_mm,
          y_mm:         input.y_mm,
          rotation_deg: input.rotation_deg,
          label:        input.label ?? null,
        })
        .select("*, homefix_furniture(*)")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to add furniture: ${error?.message}`,
        });
      }

      return data;
    }),

  /** Move or rotate a placed furniture item */
  updatePlacement: protectedProcedure
    .input(
      z.object({
        placement_id:  z.string().uuid(),
        x_mm:          z.number().int().optional(),
        y_mm:          z.number().int().optional(),
        rotation_deg:  z.number().min(0).max(359.99).optional(),
        label:         z.string().max(80).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { placement_id, ...fields } = input;

      // Verify ownership via join
      const { data: existing } = await ctx.supabase
        .from("homefix_placements")
        .select("id, project_id, homefix_staging_projects!inner(user_id)")
        .eq("id", placement_id)
        .single();

      const owner = (existing as any)?.homefix_staging_projects?.user_id;
      if (!existing || owner !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Placement not found" });
      }

      const { data, error } = await ctx.supabase
        .from("homefix_placements")
        .update(fields)
        .eq("id", placement_id)
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update placement: ${error?.message}`,
        });
      }

      return data;
    }),

  /** Remove a furniture item from a staging project */
  removeFurniture: protectedProcedure
    .input(z.object({ placement_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via join
      const { data: existing } = await ctx.supabase
        .from("homefix_placements")
        .select("id, project_id, homefix_staging_projects!inner(user_id)")
        .eq("id", input.placement_id)
        .single();

      const owner = (existing as any)?.homefix_staging_projects?.user_id;
      if (!existing || owner !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Placement not found" });
      }

      const { error } = await ctx.supabase
        .from("homefix_placements")
        .delete()
        .eq("id", input.placement_id);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { removed: true };
    }),

  /** Save the full canvas state (session persistence) */
  saveSession: protectedProcedure
    .input(
      z.object({
        project_id:   z.string().uuid(),
        session_data: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("homefix_staging_projects")
        .update({ session_data: input.session_data as Json })
        .eq("id", input.project_id)
        .eq("user_id", ctx.user.id)
        .select("id, updated_at")
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Staging project not found: ${input.project_id}` });
      }

      return { saved: true, updated_at: data.updated_at };
    }),
});
