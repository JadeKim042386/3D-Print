import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc/trpc.js";
import type { Database } from "../types/database.js";

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
