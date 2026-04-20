import { initTRPC, TRPCError } from "@trpc/server";
import type { AppContext } from "./context.js";

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

/** Middleware that requires an authenticated user */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

/** Middleware that requires privacy_policy and data_processing consents */
const hasRequiredConsents = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const { data: consents } = await ctx.supabase
    .from("consents")
    .select("consent_type, granted")
    .eq("user_id", ctx.user.id)
    .in("consent_type", ["privacy_policy", "data_processing"])
    .eq("granted", true);

  const grantedTypes = new Set(consents?.map((c) => c.consent_type));
  if (!grantedTypes.has("privacy_policy") || !grantedTypes.has("data_processing")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Required consents (privacy_policy, data_processing) must be granted before using this service.",
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Protected procedure that also verifies required PIPA consents */
export const consentedProcedure = t.procedure.use(isAuthed).use(hasRequiredConsents);
