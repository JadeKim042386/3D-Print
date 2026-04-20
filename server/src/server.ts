import Fastify from "fastify";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { createGenerationQueue } from "./queue/generation-queue.js";
import { createContextFactory } from "./trpc/context.js";
import { createAppRouter, type AppRouter } from "./routes/app-router.js";
import { TossPaymentsProvider } from "./providers/toss-payments.js";
import type { PaymentProvider } from "./types/payment.js";
import type { Database } from "./types/database.js";

function createPaymentProvider(config: ReturnType<typeof loadConfig>): PaymentProvider {
  if (!config.TOSS_PAYMENTS_SECRET_KEY || !config.TOSS_PAYMENTS_CLIENT_KEY) {
    throw new Error("TOSS_PAYMENTS_SECRET_KEY and TOSS_PAYMENTS_CLIENT_KEY are required");
  }
  return new TossPaymentsProvider({
    secretKey: config.TOSS_PAYMENTS_SECRET_KEY,
    clientKey: config.TOSS_PAYMENTS_CLIENT_KEY,
    webhookSecret: config.TOSS_PAYMENTS_WEBHOOK_SECRET,
  });
}

async function main() {
  const config = loadConfig();
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const generationQueue = createGenerationQueue(redis);
  const paymentProvider = createPaymentProvider(config);

  const createContext = createContextFactory({
    supabaseUrl: config.SUPABASE_URL,
    supabaseServiceKey: config.SUPABASE_SERVICE_KEY,
    supabaseAnonKey: config.SUPABASE_ANON_KEY,
    generationQueue,
  });

  const appRouter = createAppRouter(paymentProvider);

  const server = Fastify({ logger: true });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // Health check
  server.get("/health", async () => ({ status: "ok" }));

  // Toss Payments webhook handler
  server.post("/webhooks/toss", async (request, reply) => {
    const signature = (request.headers["x-toss-signature"] as string) ?? "";
    const body = JSON.stringify(request.body);

    try {
      const event = paymentProvider.verifyWebhook(body, signature);
      const supabase = createClient<Database>(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_KEY
      );

      const { paymentKey, orderId, status } = event.data;

      if (event.eventType === "PAYMENT_STATUS_CHANGED") {
        const updateData: Database["public"]["Tables"]["orders"]["Update"] = {
          payment_status: status,
        };

        if (status === "DONE") {
          updateData.status = "confirmed";
        } else if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
          updateData.status = "cancelled";
        }

        await supabase
          .from("orders")
          .update(updateData)
          .eq("payment_key", paymentKey);
      }

      return reply.code(200).send({ success: true });
    } catch (err) {
      server.log.error(err, "Webhook processing failed");
      return reply.code(400).send({ error: "Invalid webhook" });
    }
  });

  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${config.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
