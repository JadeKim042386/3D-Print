import IORedis from "ioredis";
import { loadConfig } from "./config.js";
import { initSentry } from "./lib/sentry.js";
import { getSupabaseClient } from "./storage/supabase.js";
import { MeshyProvider } from "./providers/meshy.js";
import { MockGenerationProvider } from "./providers/mock-generation.js";
import { BlenderProvider } from "./providers/blender.js";
import { createGenerationWorker } from "./queue/generation-worker.js";
import { createPrintReadinessQueue } from "./queue/print-readiness-queue.js";
import { createMailer } from "./lib/mailer.js";
import { createCreditResetWorker, scheduleMonthlyCreditReset, scheduleDailyRenewalCheck } from "./queue/credit-reset-worker.js";
import { createCreditResetQueue } from "./queue/credit-reset-queue.js";

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
    console.error("[redis] Connection error:", err.message);
  });
  // Worker requires Redis — fail loudly if it can't connect
  await redis.ping();
  const provider = config.MESHY_API_KEY
    ? new MeshyProvider(config.MESHY_API_KEY)
    : new MockGenerationProvider();

  const printReadinessQueue = createPrintReadinessQueue(redis);
  const creditResetQueue = createCreditResetQueue(redis);
  const mailer = createMailer(config);

  // DPR-247 / DPR-248 — when RENDER_PROVIDER=blender, route homefix-render
  // jobs through the in-house Celery worker fleet. Requires CELERY_BROKER_URL
  // pointing at the same Redis instance the Python worker consumes from.
  let blenderProvider: BlenderProvider | undefined;
  if (config.RENDER_PROVIDER === "blender") {
    const celeryUrl = config.CELERY_BROKER_URL ?? config.REDIS_URL;
    blenderProvider = new BlenderProvider({ supabase, celeryBrokerUrl: celeryUrl });
    console.log(`BlenderProvider enabled (quality=${config.RENDER_QUALITY}, broker=${celeryUrl.replace(/\/\/[^@]*@/, "//<redacted>@")})`);
  }

  const generationWorker = createGenerationWorker({
    connection: redis,
    provider,
    supabase,
    bucket: config.STORAGE_BUCKET,
    printReadinessQueue,
    mailer,
    blenderProvider,
  });

  const creditResetWorker = createCreditResetWorker({
    connection: redis,
    supabase,
    mailer,
  });

  // Schedule recurring jobs (idempotent — BullMQ deduplicates by jobId)
  await scheduleMonthlyCreditReset(creditResetQueue);
  await scheduleDailyRenewalCheck(creditResetQueue);

  console.log(`Generation worker started (provider: ${provider.name})`);
  console.log("Credit reset worker started (monthly reset + daily renewal check)");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down workers...");
    await generationWorker.close();
    await creditResetWorker.close();
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
