import Fastify from "fastify";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { createGenerationQueue } from "./queue/generation-queue.js";
import { createContextFactory } from "./trpc/context.js";
import { appRouter } from "./routes/app-router.js";

async function main() {
  const config = loadConfig();
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const generationQueue = createGenerationQueue(redis);

  const createContext = createContextFactory({
    supabaseUrl: config.SUPABASE_URL,
    supabaseServiceKey: config.SUPABASE_SERVICE_KEY,
    supabaseAnonKey: config.SUPABASE_ANON_KEY,
    generationQueue,
  });

  const server = Fastify({ logger: true });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    } satisfies FastifyTRPCPluginOptions<typeof appRouter>["trpcOptions"],
  });

  // Health check
  server.get("/health", async () => ({ status: "ok" }));

  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${config.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
