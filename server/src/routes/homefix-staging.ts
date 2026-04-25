import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";
import type { Json } from "../types/database.js";
import {
  autoPlace,
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type Vec2,
  type ExistingItem,
} from "../lib/auto-placement/index.js";

const ROOM_TYPES = ["거실", "침실", "주방", "화장실", "발코니", "기타"] as const;

/**
 * Build a CCW room polygon (mm) from staging-project geometry.
 * Origin = bottom-left. L-shape notch (when l_width/l_depth set) is removed
 * from the top-right corner.
 */
function projectPolygon(p: {
  room_width_mm: number;
  room_depth_mm: number;
  l_width_mm: number | null;
  l_depth_mm: number | null;
}): Vec2[] {
  const w = p.room_width_mm;
  const d = p.room_depth_mm;
  if (p.l_width_mm && p.l_depth_mm && p.l_width_mm < w && p.l_depth_mm < d) {
    // L-shape: notch in top-right corner.
    return [
      { x_mm: 0, y_mm: 0 },
      { x_mm: w, y_mm: 0 },
      { x_mm: w, y_mm: d - p.l_depth_mm },
      { x_mm: w - p.l_width_mm, y_mm: d - p.l_depth_mm },
      { x_mm: w - p.l_width_mm, y_mm: d },
      { x_mm: 0, y_mm: d },
    ];
  }
  return [
    { x_mm: 0, y_mm: 0 },
    { x_mm: w, y_mm: 0 },
    { x_mm: w, y_mm: d },
    { x_mm: 0, y_mm: d },
  ];
}

function isFurnitureCategory(c: string): c is FurnitureCategory {
  return (FURNITURE_CATEGORIES as readonly string[]).includes(c);
}

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
          .select("*, furniture_catalog(*)")
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

  /**
   * Auto-place a candidate piece of furniture in a project.
   *
   * Returns the best pose plus up to `k - 1` alternatives and a `confidence`
   * score. **Confidence** is the weighted-sum fitness score in `[0, 1]` of
   * the best candidate (see `WEIGHTS` in `server/src/lib/auto-placement/scorer.ts`):
   * higher means more sub-criteria (wall affinity, clearance, pairing, etc.)
   * were satisfied. Returns `0` when no valid pose exists (`best` is `null`).
   *
   * `clearance_mm` is enforced as a hard constraint: the front corners of the
   * placed piece must lie at least `clearance_mm` away from any room wall.
   * For wall-aligned categories the back corners are allowed to touch the
   * wall they are flush against.
   *
   * Implemented as a **query** (no DB writes); the client decides which
   * suggestion to accept and then calls `addFurniture` with the chosen pose.
   */
  autoPlace: protectedProcedure
    .input(
      z.object({
        project_id:   z.string().uuid(),
        furniture_id: z.string().uuid(),
        k:            z.number().int().min(1).max(10).default(3),
        clearance_mm: z.number().int().min(0).max(500).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 1. Project + candidate furniture + existing placements
      const [projectRes, candidateRes, placementsRes] = await Promise.all([
        ctx.supabase
          .from("homefix_staging_projects")
          .select("id, room_width_mm, room_depth_mm, l_width_mm, l_depth_mm")
          .eq("id", input.project_id)
          .eq("user_id", ctx.user.id)
          .single(),
        ctx.supabase
          .from("furniture_catalog")
          .select("id, category, width_mm, depth_mm, height_mm")
          .eq("id", input.furniture_id)
          .single(),
        ctx.supabase
          .from("homefix_placements")
          .select("furniture_id, x_mm, y_mm, rotation_deg")
          .eq("project_id", input.project_id),
      ]);

      if (projectRes.error || !projectRes.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staging project not found" });
      }
      if (candidateRes.error || !candidateRes.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Furniture item not found" });
      }
      if (!isFurnitureCategory(candidateRes.data.category)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported category: ${candidateRes.data.category}`,
        });
      }

      const polygon = projectPolygon(projectRes.data);

      // Fetch dimensions for every distinct furniture item already placed.
      const placedRows = placementsRes.data ?? [];
      const furnitureIds = [...new Set(placedRows.map((r) => r.furniture_id))];
      const existing: ExistingItem[] = [];
      if (furnitureIds.length > 0) {
        const { data: catalogRows, error: catalogErr } = await ctx.supabase
          .from("furniture_catalog")
          .select("id, category, width_mm, depth_mm")
          .in("id", furnitureIds);
        if (catalogErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to load placed furniture: ${catalogErr.message}`,
          });
        }
        const byId = new Map((catalogRows ?? []).map((r) => [r.id, r] as const));
        for (const row of placedRows) {
          const f = byId.get(row.furniture_id);
          if (!f || !isFurnitureCategory(f.category)) continue;
          existing.push({
            x_mm: row.x_mm,
            y_mm: row.y_mm,
            rotation_deg: Number(row.rotation_deg),
            width_mm: f.width_mm,
            depth_mm: f.depth_mm,
            category: f.category,
          });
        }
      }

      const result = autoPlace({
        roomPolygon: polygon,
        existing,
        candidate: {
          width_mm: candidateRes.data.width_mm,
          depth_mm: candidateRes.data.depth_mm,
          height_mm: candidateRes.data.height_mm,
          category: candidateRes.data.category,
        },
        k: input.k,
        clearanceMm: input.clearance_mm,
      });

      return {
        best: result.best,
        alternatives: result.alternatives,
        confidence: result.confidence,
        room: {
          polygon,
          width_mm: projectRes.data.room_width_mm,
          depth_mm: projectRes.data.room_depth_mm,
        },
      };
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
