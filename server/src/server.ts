import Fastify from "fastify";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { getSupabaseClient } from "./storage/supabase.js";
import { createGenerationQueue } from "./queue/generation-queue.js";
import { generateRouter, type RouterContext } from "./routes/generate.js";

async function main() {
  const config = loadConfig();
  const supabase = getSupabaseClient(config);
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const generationQueue = createGenerationQueue(redis);

  const server = Fastify({ logger: true });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: generateRouter,
      createContext: (): RouterContext => ({
        supabase,
        generationQueue,
      }),
    } satisfies FastifyTRPCPluginOptions<typeof generateRouter>["trpcOptions"],
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
