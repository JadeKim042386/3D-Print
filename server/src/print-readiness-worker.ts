/**
 * print-readiness-worker.ts  (entry point)
 *
 * Standalone server process for print-readiness validation.
 * Run independently of the generation and dimension workers:
 *
 *   npm run print-readiness-worker
 *   # or in dev: tsx src/print-readiness-worker.ts
 *
 * This process handles all jobs on the "print-readiness" BullMQ queue.
 */

import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { initSentry } from "./lib/sentry.js";
import { getSupabaseClient } from "./storage/supabase.js";
import { createPrintReadinessWorker } from "./queue/print-readiness-worker.js";

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
    console.error("[print-readiness-worker] Redis error:", err.message);
  });

  await redis.ping();

  const worker = createPrintReadinessWorker({
    connection: redis,
    supabase,
    bucket: config.STORAGE_BUCKET,
  });

  console.log(
    `[print-readiness-worker] Started — queue: print-readiness`
  );

  const shutdown = async () => {
    console.log("[print-readiness-worker] Shutting down...");
    await worker.close();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[print-readiness-worker] Failed to start:", err);
  process.exit(1);
});
