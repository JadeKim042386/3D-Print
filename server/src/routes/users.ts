import { TRPCError } from "@trpc/server";
import { createClient } from "@supabase/supabase-js";
import { router, protectedProcedure } from "../trpc/trpc.js";
import type { Database } from "../types/database.js";

export const usersRouter = router({
  /** Delete all user data (PIPA right to erasure). Cascades via FK constraints. */
  deleteMe: protectedProcedure.mutation(async ({ ctx }) => {
    // Delete from public.users — cascades to models, orders, consents, print_orders
    const { error: deleteError } = await ctx.supabase
      .from("users")
      .delete()
      .eq("id", ctx.user.id);

    if (deleteError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete user data: ${deleteError.message}`,
      });
    }

    // Delete from Supabase Auth (requires service role, already used in ctx.supabase)
    const { error: authError } =
      await ctx.supabase.auth.admin.deleteUser(ctx.user.id);

    if (authError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete auth account: ${authError.message}`,
      });
    }

    return { deleted: true };
  }),

  /** Get current user profile */
  me: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("users")
      .select("id, email, display_name, avatar_url, created_at")
      .eq("id", ctx.user.id)
      .single();

    if (error || !data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return data;
  }),
});
