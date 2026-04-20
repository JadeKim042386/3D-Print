import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { initSentry } from "./lib/sentry.js";
import { getSupabaseClient } from "./storage/supabase.js";
import { MeshyProvider } from "./providers/meshy.js";
import { createGenerationWorker } from "./queue/generation-worker.js";

async function main() {
  const config = loadConfig();
  initSentry(config);

  const supabase = getSupabaseClient(config);
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const provider = new MeshyProvider(config.MESHY_API_KEY);

  const worker = createGenerationWorker({
    connection: redis,
    provider,
    supabase,
    bucket: config.STORAGE_BUCKET,
  });

  console.log(`Generation worker started (provider: ${provider.name})`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
