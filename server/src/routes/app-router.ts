import { router } from "../trpc/trpc.js";
import { modelsRouter } from "./models.js";
import { consentsRouter } from "./consents.js";
import type { PaymentProvider } from "../types/payment.js";
import { createPaymentsRouter } from "./payments.js";

export function createAppRouter(paymentProvider: PaymentProvider) {
  return router({
    models: modelsRouter,
    consents: consentsRouter,
    payments: createPaymentsRouter(paymentProvider),
  });
}

/** Static router for type inference (uses a dummy provider) */
export const appRouter = router({
  models: modelsRouter,
  consents: consentsRouter,
  payments: createPaymentsRouter(null as unknown as PaymentProvider),
});

export type AppRouter = typeof appRouter;
