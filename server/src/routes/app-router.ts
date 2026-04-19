import { router } from "../trpc/trpc.js";
import { modelsRouter } from "./models.js";
import { consentsRouter } from "./consents.js";

export const appRouter = router({
  models: modelsRouter,
  consents: consentsRouter,
});

export type AppRouter = typeof appRouter;
