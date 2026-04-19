import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc/trpc.js";

const consentTypeEnum = z.enum([
  "terms_of_service",
  "privacy_policy",
  "marketing",
  "data_processing",
  "third_party_sharing",
]);

export const consentsRouter = router({
  /** Grant a consent */
  grant: protectedProcedure
    .input(
      z.object({
        consentType: consentTypeEnum,
        version: z.string().default("1.0"),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("consents")
        .upsert(
          {
            user_id: ctx.user.id,
            consent_type: input.consentType,
            granted: true,
            granted_at: new Date().toISOString(),
            revoked_at: null,
            ip_address: input.ipAddress ?? null,
            user_agent: input.userAgent ?? null,
            version: input.version,
          },
          { onConflict: "user_id,consent_type,version" }
        )
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to grant consent: ${error?.message}`,
        });
      }

      return { consentId: data.id, granted: true };
    }),

  /** Revoke a consent */
  revoke: protectedProcedure
    .input(
      z.object({
        consentType: consentTypeEnum,
        version: z.string().default("1.0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("consents")
        .update({
          granted: false,
          revoked_at: new Date().toISOString(),
        })
        .eq("user_id", ctx.user.id)
        .eq("consent_type", input.consentType)
        .eq("version", input.version);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to revoke consent: ${error.message}`,
        });
      }

      return { granted: false };
    }),

  /** List all consents for the authenticated user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("consents")
      .select("*")
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to list consents: ${error.message}`,
      });
    }

    return data ?? [];
  }),
});
