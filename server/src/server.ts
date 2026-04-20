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
import { ThreeDLineProvider } from "./providers/threedline.js";
import { CraftcloudProvider } from "./providers/craftcloud.js";
import type { PaymentProvider } from "./types/payment.js";
import type { PrintProvider } from "./types/print.js";
import type { Database } from "./types/database.js";
import { createTransport } from "nodemailer";
import { piiSafeLoggerOptions } from "./middleware/pii-sanitizer.js";

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

function createPrintProviders(config: ReturnType<typeof loadConfig>): PrintProvider[] {
  const providers: PrintProvider[] = [];

  if (config.THREEDLINE_ORDER_EMAIL) {
    const transporter =
      config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS
        ? createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT ?? 587,
            secure: (config.SMTP_PORT ?? 587) === 465,
            auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
          })
        : null;

    providers.push(
      new ThreeDLineProvider({
        orderEmail: config.THREEDLINE_ORDER_EMAIL,
        sendEmail: async (to, subject, body) => {
          if (!transporter) {
            console.log(`[3DLINE Email] To: ${to}\nSubject: ${subject}\n${body}`);
            return;
          }
          await transporter.sendMail({
            from: config.SMTP_FROM ?? config.SMTP_USER,
            to,
            subject,
            text: body,
          });
        },
      })
    );
  }

  if (config.CRAFTCLOUD_API_KEY) {
    providers.push(new CraftcloudProvider({ apiKey: config.CRAFTCLOUD_API_KEY }));
  }

  return providers;
}

async function main() {
  const config = loadConfig();
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const generationQueue = createGenerationQueue(redis);
  const paymentProvider = createPaymentProvider(config);
  const printProviders = createPrintProviders(config);

  const createContext = createContextFactory({
    supabaseUrl: config.SUPABASE_URL,
    supabaseServiceKey: config.SUPABASE_SERVICE_KEY,
    supabaseAnonKey: config.SUPABASE_ANON_KEY,
    generationQueue,
  });

  const appRouter = createAppRouter(paymentProvider, printProviders);

  const server = Fastify({
    logger: {
      level: "info",
      ...piiSafeLoggerOptions,
    },
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // Health check with service status
  server.get("/health", async () => {
    const services: Record<string, string> = {};

    try {
      await redis.ping();
      services.redis = "ok";
    } catch {
      services.redis = "error";
    }

    const allOk = Object.values(services).every((s) => s === "ok");
    return { status: allOk ? "ok" : "degraded", services };
  });

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

  // Craftcloud print provider webhook handler
  server.post("/webhooks/craftcloud", async (request, reply) => {
    const signature = (request.headers["x-craftcloud-signature"] as string) ?? "";
    const body = JSON.stringify(request.body);

    const craftcloudProvider = printProviders.find((p) => p.name === "craftcloud");
    if (!craftcloudProvider) {
      return reply.code(404).send({ error: "Craftcloud provider not configured" });
    }

    try {
      const event = craftcloudProvider.verifyWebhook(body, signature);
      const supabase = createClient<Database>(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_KEY
      );

      await supabase
        .from("print_orders")
        .update({
          status: event.status,
          tracking_number: event.trackingNumber,
          tracking_url: event.trackingUrl,
        })
        .eq("provider_order_id", event.providerOrderId)
        .eq("provider_name", "craftcloud");

      return reply.code(200).send({ success: true });
    } catch (err) {
      server.log.error(err, "Craftcloud webhook processing failed");
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
