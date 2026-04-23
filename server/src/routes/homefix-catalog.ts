import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc/trpc.js";

const FURNITURE_CATEGORIES = [
  "소파", "침대", "식탁/의자", "수납장", "TV장",
  "책상", "주방가구", "욕실가구", "기타",
] as const;

export const homefixCatalogRouter = router({
  /** Browse furniture catalog with optional filters */
  list: publicProcedure
    .input(
      z.object({
        category:     z.enum(FURNITURE_CATEGORIES).optional(),
        brand:        z.string().optional(),
        query:        z.string().max(100).optional(),  // Korean name search
        min_width_mm: z.number().int().positive().optional(),
        max_width_mm: z.number().int().positive().optional(),
        min_price_krw: z.number().int().nonnegative().optional(),
        max_price_krw: z.number().int().nonnegative().optional(),
        limit:  z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("homefix_furniture")
        .select("*", { count: "exact" });

      if (input.category)      query = query.eq("category", input.category);
      if (input.brand)         query = query.ilike("brand", `%${input.brand}%`);
      if (input.query)         query = query.ilike("name_ko", `%${input.query}%`);
      if (input.min_width_mm)  query = query.gte("width_mm", input.min_width_mm);
      if (input.max_width_mm)  query = query.lte("width_mm", input.max_width_mm);
      if (input.min_price_krw) query = query.gte("price_krw", input.min_price_krw);
      if (input.max_price_krw) query = query.lte("price_krw", input.max_price_krw);

      const { data, error, count } = await query
        .order("name_ko")
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Catalog query failed: ${error.message}`,
        });
      }

      return { items: data ?? [], total: count ?? 0, offset: input.offset };
    }),

  /** Get a single furniture item by ID */
  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("homefix_furniture")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Furniture item not found: ${input.id}` });
      }

      return data;
    }),

  /** List available categories (distinct values from catalog) */
  categories: publicProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("homefix_furniture")
      .select("category")
      .order("category");

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    const unique = [...new Set((data ?? []).map((r) => r.category))];
    return unique;
  }),

  /** Get affiliate purchase URL for a catalog item */
  affiliateUrl: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("homefix_furniture")
        .select("id, name_ko, affiliate_url, price_krw")
        .eq("id", input.id)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Furniture item not found: ${input.id}` });
      }

      return {
        furnitureId: data.id,
        name_ko:     data.name_ko,
        affiliate_url: data.affiliate_url ?? null,
        price_krw:   data.price_krw ?? null,
      };
    }),
});
