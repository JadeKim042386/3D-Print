import { router } from "../trpc/trpc.js";
import { modelsRouter } from "./models.js";
import { consentsRouter } from "./consents.js";
import { usersRouter } from "./users.js";
import { generateRouter } from "./generate.js";
import type { PaymentProvider } from "../types/payment.js";
import type { PrintProvider } from "../types/print.js";
import { createPaymentsRouter } from "./payments.js";
import { createPrintRouter } from "./print.js";

export function createAppRouter(
  paymentProvider: PaymentProvider | null,
  printProviders: PrintProvider[]
) {
  return router({
    models: modelsRouter,
    consents: consentsRouter,
    users: usersRouter,
    generate: generateRouter,
    payments: createPaymentsRouter(paymentProvider),
    print: createPrintRouter(printProviders),
  });
}

/** Static router for type inference (uses dummy providers) */
export const appRouter = router({
  models: modelsRouter,
  consents: consentsRouter,
  users: usersRouter,
  generate: generateRouter,
  payments: createPaymentsRouter(null as unknown as PaymentProvider),
  print: createPrintRouter([]),
});

export type AppRouter = typeof appRouter;
