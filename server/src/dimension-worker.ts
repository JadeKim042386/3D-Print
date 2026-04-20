/**
 * dimension-worker.ts  (entry point)
 *
 * Standalone server process for dimension-based 3D generation.
 * Run independently of the Meshy AI generation worker:
 *
 *   npm run dimension-worker
 *   # or in dev: tsx src/dimension-worker.ts
 *
 * This process handles all jobs on the "dimension-generation" BullMQ queue.
 * It is completely separate from the AI generation worker (worker.ts).
 */

import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { initSentry } from "./lib/sentry.js";
import { getSupabaseClient } from "./storage/supabase.js";
import { MeshyProvider } from "./providers/meshy.js";
import { MockGenerationProvider } from "./providers/mock-generation.js";
import { createDimensionWorker } from "./queue/dimension-worker.js";
import { createPrintReadinessQueue } from "./queue/print-readiness-queue.js";

async function main() {
  const config = loadConfig();
  initSentry(config);

  const supabase = getSupabaseClient(config);

  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
  });

  redis.on("error", (err) => {
    console.error("[dimension-worker] Redis error:", err.message);
  });

  // Dimension worker requires Redis
  await redis.ping();

  // Use Meshy for dimension_aware_ai path; fall back to mock in dev
  const aiProvider = config.MESHY_API_KEY
    ? new MeshyProvider(config.MESHY_API_KEY)
    : new MockGenerationProvider();

  const printReadinessQueue = createPrintReadinessQueue(redis);

  const worker = createDimensionWorker({
    connection:  redis,
    aiProvider,
    supabase,
    bucket: config.STORAGE_BUCKET,
    printReadinessQueue,
  });

  console.log(
    `[dimension-worker] Started — AI provider: ${aiProvider.name}, ` +
    `queue: dimension-generation`
  );

  const shutdown = async () => {
    console.log("[dimension-worker] Shutting down...");
    await worker.close();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[dimension-worker] Failed to start:", err);
  process.exit(1);
});
