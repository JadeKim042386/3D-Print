import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc/trpc.js";
import type { Database } from "../types/database.js";
import { adminAdjustCredits, ensureUserCredits } from "../lib/credits.js";

const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "printing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

const printOrderStatusSchema = z.enum([
  "quote_requested",
  "quoted",
  "order_placed",
  "printing",
  "shipped",
  "delivered",
  "failed",
]);

export const adminRouter = router({
  /** List all orders (payment orders) with optional filters */
  listOrders: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("orders")
        .select("*, users!orders_user_id_fkey(email, display_name)", {
          count: "exact",
        })
        .order("created_at", { ascending: false });

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.dateFrom) {
        query = query.gte("created_at", input.dateFrom);
      }
      if (input.dateTo) {
        query = query.lte("created_at", input.dateTo);
      }

      query = query.range(input.offset, input.offset + input.limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list orders: ${error.message}`,
        });
      }

      return { orders: data ?? [], total: count ?? 0 };
    }),

  /** List all print orders with optional filters */
  listPrintOrders: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.string().optional(),
        providerName: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("print_orders")
        .select("*, users!print_orders_user_id_fkey(email, display_name)", {
          count: "exact",
        })
        .order("created_at", { ascending: false });

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.providerName) {
        query = query.eq("provider_name", input.providerName);
      }
      if (input.dateFrom) {
        query = query.gte("created_at", input.dateFrom);
      }
      if (input.dateTo) {
        query = query.lte("created_at", input.dateTo);
      }

      query = query.range(input.offset, input.offset + input.limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list print orders: ${error.message}`,
        });
      }

      return { orders: data ?? [], total: count ?? 0 };
    }),

  /** Update order status (admin override) */
  updateOrderStatus: adminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        status: orderStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Database["public"]["Tables"]["orders"]["Update"] = {
        status: input.status,
        ...(input.status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
      };

      const { data, error } = await ctx.supabase
        .from("orders")
        .update(updateData)
        .eq("id", input.orderId)
        .select("id, status")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Order not found or update failed: ${error?.message}`,
        });
      }

      return data;
    }),

  /** Update print order status (admin override) */
  updatePrintOrderStatus: adminProcedure
    .input(
      z.object({
        printOrderId: z.string().uuid(),
        status: printOrderStatusSchema,
        trackingNumber: z.string().optional(),
        trackingUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Database["public"]["Tables"]["print_orders"]["Update"] = {
        status: input.status,
        ...(input.trackingNumber ? { tracking_number: input.trackingNumber } : {}),
        ...(input.trackingUrl ? { tracking_url: input.trackingUrl } : {}),
      };

      const { data, error } = await ctx.supabase
        .from("print_orders")
        .update(updateData)
        .eq("id", input.printOrderId)
        .select("id, status")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Print order not found or update failed: ${error?.message}`,
        });
      }

      return data;
    }),

  /** List all users */
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data: users, error, count } = await ctx.supabase
        .from("users")
        .select("id, email, display_name, role, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list users: ${error.message}`,
        });
      }

      // Get order counts per user
      const userIds = (users ?? []).map((u) => u.id);
      const { data: orderCounts } = await ctx.supabase
        .from("orders")
        .select("user_id")
        .in("user_id", userIds);

      const { data: printOrderCounts } = await ctx.supabase
        .from("print_orders")
        .select("user_id")
        .in("user_id", userIds);

      const countMap = new Map<string, number>();
      for (const o of orderCounts ?? []) {
        countMap.set(o.user_id, (countMap.get(o.user_id) ?? 0) + 1);
      }
      for (const o of printOrderCounts ?? []) {
        countMap.set(o.user_id, (countMap.get(o.user_id) ?? 0) + 1);
      }

      const enrichedUsers = (users ?? []).map((u) => ({
        ...u,
        totalOrders: countMap.get(u.id) ?? 0,
      }));

      return { users: enrichedUsers, total: count ?? 0 };
    }),

  /**
   * Generation quality metrics — quantitative evaluation of dimensional accuracy
   * across generation types (text-to-3D, image-to-3D, parametric).
   *
   * Returns aggregate statistics: mean accuracy, min/max, pass rate, and
   * per-generation-type breakdowns for quality monitoring and research.
   */
  getGenerationMetrics: adminProcedure.query(async ({ ctx }) => {
    // Fetch all models with dimensional accuracy data
    const { data: models } = await ctx.supabase
      .from("models")
      .select("generation_type, dimensional_accuracy_pct, actual_width_mm, actual_height_mm, actual_depth_mm, width_mm, height_mm, depth_mm, status, source_image_url, created_at")
      .not("dimensional_accuracy_pct", "is", null)
      .eq("status", "ready");

    const rows = models ?? [];

    // Helper: compute stats for a set of accuracy values
    function computeStats(accuracyValues: number[]) {
      if (accuracyValues.length === 0) {
        return { count: 0, meanAccuracy: null, minAccuracy: null, maxAccuracy: null, medianAccuracy: null, passRate: null, stdDev: null };
      }
      const sorted = [...accuracyValues].sort((a, b) => a - b);
      const n = sorted.length;
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
      const median = n % 2 === 0
        ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
        : sorted[Math.floor(n / 2)]!;
      const passed = sorted.filter((v) => v >= 99).length;

      return {
        count: n,
        meanAccuracy: Math.round(mean * 100) / 100,
        minAccuracy: Math.round(sorted[0]! * 100) / 100,
        maxAccuracy: Math.round(sorted[n - 1]! * 100) / 100,
        medianAccuracy: Math.round(median * 100) / 100,
        passRate: Math.round((passed / n) * 10000) / 100,
        stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
      };
    }

    // All models
    const allAccuracy = rows.map((r) => r.dimensional_accuracy_pct!);
    const overall = computeStats(allAccuracy);

    // Per generation type
    const byType: Record<string, number[]> = {};
    for (const r of rows) {
      const type = r.generation_type ?? "unknown";
      if (!byType[type]) byType[type] = [];
      byType[type]!.push(r.dimensional_accuracy_pct!);
    }

    const perType: Record<string, ReturnType<typeof computeStats>> = {};
    for (const [type, vals] of Object.entries(byType)) {
      perType[type] = computeStats(vals);
    }

    // Per size bucket
    const sizeBuckets = { small: [] as number[], medium: [] as number[], large: [] as number[] };
    for (const r of rows) {
      const maxDim = Math.max(r.width_mm ?? 0, r.height_mm ?? 0, r.depth_mm ?? 0);
      const acc = r.dimensional_accuracy_pct!;
      if (maxDim <= 50) sizeBuckets.small.push(acc);
      else if (maxDim <= 200) sizeBuckets.medium.push(acc);
      else sizeBuckets.large.push(acc);
    }

    const perSize = {
      small: computeStats(sizeBuckets.small),
      medium: computeStats(sizeBuckets.medium),
      large: computeStats(sizeBuckets.large),
    };

    // Image-to-3D specific stats
    const imageModels = rows.filter((r) => r.source_image_url != null);
    const imageAccuracy = imageModels.map((r) => r.dimensional_accuracy_pct!);
    const imageStats = computeStats(imageAccuracy);

    // Trend: last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const recentRows = rows.filter((r) => r.created_at > weekAgo);
    const recentAccuracy = recentRows.map((r) => r.dimensional_accuracy_pct!);
    const recentStats = computeStats(recentAccuracy);

    return {
      overall,
      perGenerationType: perType,
      perSizeBucket: perSize,
      imageTo3d: imageStats,
      lastSevenDays: recentStats,
      totalModelsWithAccuracy: rows.length,
    };
  }),

  /** Get a user's current credit balance (admin view) */
  getUserCredits: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ensureUserCredits(ctx.supabase, input.userId);
    }),

  /** Manually adjust a user's credits (admin override) */
  adjustUserCredits: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        /** Positive = consume credits, negative = restore/add credits */
        delta: z.number().int().min(-1000).max(1000),
        note:  z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return adminAdjustCredits(
        ctx.supabase,
        input.userId,
        input.delta,
        ctx.user.id,
        input.note
      );
    }),

  /** Change a user's subscription plan (admin override) */
  setUserPlan: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        planId: z.enum(["free", "pro", "business"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const planCredits: Record<string, number> = {
        free:     3,
        pro:      30,
        business: -1,
      };

      const newLimit = planCredits[input.planId]!;

      const { data, error } = await ctx.supabase
        .from("user_credits")
        .update({
          plan_id:       input.planId,
          credits_limit: newLimit,
          // Reset usage when upgrading
          credits_used:  0,
        })
        .eq("user_id", input.userId)
        .select("*")
        .single();

      if (error) {
        // Row may not exist yet — upsert via ensureUserCredits first
        const credits = await ensureUserCredits(ctx.supabase, input.userId);
        const { data: updated, error: updateError } = await ctx.supabase
          .from("user_credits")
          .update({ plan_id: input.planId, credits_limit: newLimit, credits_used: 0 })
          .eq("id", credits.id)
          .select("*")
          .single();
        if (updateError || !updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update user plan: ${updateError?.message}`,
          });
        }
        return updated;
      }

      return data;
    }),

  /** Revenue metrics */
  getMetrics: adminProcedure.query(async ({ ctx }) => {
    // Total orders count
    const { count: totalOrders } = await ctx.supabase
      .from("orders")
      .select("id", { count: "exact", head: true });

    const { count: totalPrintOrders } = await ctx.supabase
      .from("print_orders")
      .select("id", { count: "exact", head: true });

    // Revenue this month (from orders table)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthlyOrders } = await ctx.supabase
      .from("orders")
      .select("total_price_krw")
      .gte("created_at", monthStart.toISOString())
      .in("status", ["confirmed", "printing", "shipped", "delivered"]);

    const { data: monthlyPrintOrders } = await ctx.supabase
      .from("print_orders")
      .select("price_krw")
      .gte("created_at", monthStart.toISOString())
      .in("status", ["order_placed", "printing", "shipped", "delivered"]);

    const monthlyRevenue =
      (monthlyOrders ?? []).reduce(
        (sum, o) => sum + (o.total_price_krw ?? 0),
        0
      ) +
      (monthlyPrintOrders ?? []).reduce(
        (sum, o) => sum + (o.price_krw ?? 0),
        0
      );

    // All-time revenue
    const { data: allOrders } = await ctx.supabase
      .from("orders")
      .select("total_price_krw")
      .in("status", ["confirmed", "printing", "shipped", "delivered"]);

    const { data: allPrintOrders } = await ctx.supabase
      .from("print_orders")
      .select("price_krw")
      .in("status", ["order_placed", "printing", "shipped", "delivered"]);

    const totalRevenue =
      (allOrders ?? []).reduce(
        (sum, o) => sum + (o.total_price_krw ?? 0),
        0
      ) +
      (allPrintOrders ?? []).reduce(
        (sum, o) => sum + (o.price_krw ?? 0),
        0
      );

    const totalOrderCount = (totalOrders ?? 0) + (totalPrintOrders ?? 0);
    const avgOrderValue =
      totalOrderCount > 0 ? Math.round(totalRevenue / totalOrderCount) : 0;

    // Total users
    const { count: totalUsers } = await ctx.supabase
      .from("users")
      .select("id", { count: "exact", head: true });

    return {
      totalOrders: totalOrderCount,
      totalRevenue,
      monthlyRevenue,
      avgOrderValue,
      totalUsers: totalUsers ?? 0,
    };
  }),
});
