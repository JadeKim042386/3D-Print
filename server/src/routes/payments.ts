import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, consentedProcedure } from "../trpc/trpc.js";
import type { PaymentProvider } from "../types/payment.js";

export function createPaymentsRouter(paymentProvider: PaymentProvider | null) {
  return router({
    /** Create a payment order — requires PIPA consents */
    createOrder: consentedProcedure
      .input(
        z.object({
          modelId: z.string().uuid(),
          amount: z.number().int().positive(),
          orderName: z.string().min(1).max(100),
          customerName: z.string().min(1).max(50),
          customerEmail: z.string().email(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify the model belongs to the user
        const { data: model } = await ctx.supabase
          .from("models")
          .select("id")
          .eq("id", input.modelId)
          .eq("user_id", ctx.user.id)
          .single();

        if (!model) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Model not found",
          });
        }

        // Create order with payment provider
        if (!paymentProvider) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Payment provider not configured — prototype mode" });
        }
        const result = await paymentProvider.createOrder({
          modelId: input.modelId,
          amount: input.amount,
          orderName: input.orderName,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
        });

        // Store order in database
        const { data: order, error } = await ctx.supabase
          .from("orders")
          .insert({
            user_id: ctx.user.id,
            model_id: input.modelId,
            status: "pending",
            total_price_krw: input.amount,
            order_name: input.orderName,
            payment_provider: paymentProvider.name,
            payment_status: "READY",
            customer_name: input.customerName,
            customer_email: input.customerEmail,
          })
          .select("id")
          .single();

        if (error || !order) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create order: ${error?.message}`,
          });
        }

        return {
          orderId: order.id,
          providerOrderId: result.orderId,
          checkoutData: result.checkoutData,
        };
      }),

    /** Confirm a payment after user completes checkout */
    confirm: protectedProcedure
      .input(
        z.object({
          orderId: z.string(),
          paymentKey: z.string(),
          amount: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify the order belongs to the user and is pending
        const { data: order } = await ctx.supabase
          .from("orders")
          .select("*")
          .eq("id", input.orderId)
          .eq("user_id", ctx.user.id)
          .eq("status", "pending")
          .single();

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found or already processed",
          });
        }

        // Verify amount matches
        if (order.total_price_krw !== input.amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Amount mismatch",
          });
        }

        // Confirm with payment provider
        if (!paymentProvider) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Payment provider not configured — prototype mode" });
        }
        const result = await paymentProvider.confirmPayment({
          orderId: input.orderId,
          paymentKey: input.paymentKey,
          amount: input.amount,
        });

        // Update order with payment result
        const { error } = await ctx.supabase
          .from("orders")
          .update({
            payment_key: result.paymentKey,
            payment_method: result.method,
            payment_status: result.status,
            status: "confirmed",
            approved_at: result.approvedAt,
            receipt_url: result.receiptUrl,
          })
          .eq("id", input.orderId);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update order: ${error.message}`,
          });
        }

        return {
          orderId: result.orderId,
          status: result.status,
          approvedAt: result.approvedAt,
          receiptUrl: result.receiptUrl,
        };
      }),

    /** Cancel a payment */
    cancel: protectedProcedure
      .input(
        z.object({
          orderId: z.string(),
          cancelReason: z.string().min(1).max(200),
          cancelAmount: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify the order belongs to the user and is confirmed
        const { data: order } = await ctx.supabase
          .from("orders")
          .select("*")
          .eq("id", input.orderId)
          .eq("user_id", ctx.user.id)
          .single();

        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }

        if (!order.payment_key) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order has no payment to cancel",
          });
        }

        if (order.status === "cancelled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order already cancelled",
          });
        }

        // Cancel with payment provider
        if (!paymentProvider) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Payment provider not configured — prototype mode" });
        }
        const result = await paymentProvider.cancelPayment({
          paymentKey: order.payment_key,
          cancelReason: input.cancelReason,
          cancelAmount: input.cancelAmount,
        });

        // Update order status
        const { error } = await ctx.supabase
          .from("orders")
          .update({
            payment_status: result.status,
            status: "cancelled",
            cancelled_at: result.cancelledAt,
            cancel_reason: input.cancelReason,
          })
          .eq("id", input.orderId);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to update order: ${error.message}`,
          });
        }

        return {
          orderId: result.orderId,
          status: result.status,
          cancelledAmount: result.cancelledAmount,
          cancelledAt: result.cancelledAt,
        };
      }),

    /** Get order details */
    getOrder: protectedProcedure
      .input(z.object({ orderId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
          .from("orders")
          .select("*")
          .eq("id", input.orderId)
          .eq("user_id", ctx.user.id)
          .single();

        if (error || !data) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }

        return data;
      }),

    /** List orders for the authenticated user */
    listOrders: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        const { data, error, count } = await ctx.supabase
          .from("orders")
          .select("*", { count: "exact" })
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to list orders: ${error.message}`,
          });
        }

        return { orders: data ?? [], total: count ?? 0 };
      }),
  });
}
