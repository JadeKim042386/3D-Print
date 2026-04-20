import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, consentedProcedure } from "../trpc/trpc.js";
import type { PrintProvider, PrintMaterial } from "../types/print.js";

const materialSchema = z.enum([
  "PLA",
  "ABS",
  "PETG",
  "Resin",
  "Nylon",
  "TPU",
  "Metal",
]);

const shippingAddressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  province: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1).default("KR"),
});

export function createPrintRouter(providers: PrintProvider[]) {
  return router({
    /** Get quotes from all available print providers */
    getQuotes: protectedProcedure
      .input(
        z.object({
          modelId: z.string().uuid(),
          material: materialSchema,
          quantity: z.number().int().min(1).max(100).default(1),
          shippingAddress: z
            .object({
              city: z.string(),
              province: z.string(),
              zipCode: z.string(),
              country: z.string().default("KR"),
            })
            .optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        // Verify the model belongs to the user and is ready
        const { data: model } = await ctx.supabase
          .from("models")
          .select("id, file_url, status")
          .eq("id", input.modelId)
          .eq("user_id", ctx.user.id)
          .single();

        if (!model) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Model not found",
          });
        }

        if (!model.file_url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Model file is not ready yet",
          });
        }

        // Request quotes from all providers in parallel
        const quoteResults = await Promise.allSettled(
          providers.map((provider) =>
            provider.getQuote({
              modelFileUrl: model.file_url!,
              material: input.material,
              quantity: input.quantity,
              shippingAddress: input.shippingAddress,
            })
          )
        );

        const quotes = quoteResults
          .filter(
            (r): r is PromiseFulfilledResult<Awaited<ReturnType<PrintProvider["getQuote"]>>> =>
              r.status === "fulfilled"
          )
          .map((r) => r.value);

        // Sort by price (lowest first)
        quotes.sort((a, b) => a.priceKrw - b.priceKrw);

        return { quotes, modelId: input.modelId };
      }),

    /** Place a print order with a specific provider — requires PIPA consents */
    createOrder: consentedProcedure
      .input(
        z.object({
          modelId: z.string().uuid(),
          providerName: z.enum(["3dline", "craftcloud"]),
          material: materialSchema,
          quantity: z.number().int().min(1).max(100).default(1),
          priceKrw: z.number().int().positive(),
          shippingAddress: shippingAddressSchema,
          customerName: z.string().min(1),
          customerEmail: z.string().email(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify the model belongs to the user
        const { data: model } = await ctx.supabase
          .from("models")
          .select("id, file_url")
          .eq("id", input.modelId)
          .eq("user_id", ctx.user.id)
          .single();

        if (!model || !model.file_url) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Model not found or file not ready",
          });
        }

        // Find the requested provider
        const provider = providers.find((p) => p.name === input.providerName);
        if (!provider) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider "${input.providerName}" is not available`,
          });
        }

        // Place order with provider
        const result = await provider.createOrder({
          userId: ctx.user.id,
          modelId: input.modelId,
          modelFileUrl: model.file_url,
          providerName: input.providerName,
          material: input.material,
          quantity: input.quantity,
          priceKrw: input.priceKrw,
          shippingAddress: input.shippingAddress,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
        });

        // Store print order in database
        const { data: printOrder, error } = await ctx.supabase
          .from("print_orders")
          .insert({
            user_id: ctx.user.id,
            model_id: input.modelId,
            provider_name: input.providerName,
            provider_order_id: result.providerOrderId,
            status: result.status,
            material: input.material,
            quantity: input.quantity,
            price_krw: input.priceKrw,
            model_file_url: model.file_url,
            shipping_address: input.shippingAddress,
            customer_name: input.customerName,
            customer_email: input.customerEmail,
            estimated_delivery_date: result.estimatedDeliveryDate,
          })
          .select("id")
          .single();

        if (error || !printOrder) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create print order: ${error?.message}`,
          });
        }

        return {
          printOrderId: printOrder.id,
          providerOrderId: result.providerOrderId,
          status: result.status,
          estimatedDeliveryDate: result.estimatedDeliveryDate,
        };
      }),

    /** Get status of a print order */
    getOrderStatus: protectedProcedure
      .input(z.object({ printOrderId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { data: printOrder, error } = await ctx.supabase
          .from("print_orders")
          .select("*")
          .eq("id", input.printOrderId)
          .eq("user_id", ctx.user.id)
          .single();

        if (error || !printOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Print order not found",
          });
        }

        // If order has a provider order ID, try to get live status
        if (printOrder.provider_order_id) {
          const provider = providers.find(
            (p) => p.name === printOrder.provider_name
          );
          if (provider) {
            try {
              const liveStatus = await provider.getOrderStatus(
                printOrder.provider_order_id
              );

              // Update DB if status changed
              if (liveStatus.status !== printOrder.status) {
                await ctx.supabase
                  .from("print_orders")
                  .update({
                    status: liveStatus.status,
                    tracking_number: liveStatus.trackingNumber,
                    tracking_url: liveStatus.trackingUrl,
                  })
                  .eq("id", input.printOrderId);

                return {
                  ...printOrder,
                  status: liveStatus.status,
                  tracking_number: liveStatus.trackingNumber,
                  tracking_url: liveStatus.trackingUrl,
                };
              }
            } catch {
              // Fall through to return DB state
            }
          }
        }

        return printOrder;
      }),

    /** List print orders for the authenticated user */
    listOrders: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        const { data, error, count } = await ctx.supabase
          .from("print_orders")
          .select("*", { count: "exact" })
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to list print orders: ${error.message}`,
          });
        }

        return { orders: data ?? [], total: count ?? 0 };
      }),
  });
}
