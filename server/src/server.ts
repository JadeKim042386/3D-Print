import Fastify from "fastify";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { initSentry, Sentry } from "./lib/sentry.js";
import { createGenerationQueue } from "./queue/generation-queue.js";
import { createDimensionQueue } from "./queue/dimension-queue.js";
import { createContextFactory } from "./trpc/context.js";
import { createAppRouter, type AppRouter } from "./routes/app-router.js";
import { TossPaymentsProvider } from "./providers/toss-payments.js";
import { ThreeDLineProvider } from "./providers/threedline.js";
import { CraftcloudProvider } from "./providers/craftcloud.js";
import { Creatable3DProvider } from "./providers/creatable3d.js";
import { PrintOn3DProvider } from "./providers/printon3d.js";
import type { PaymentProvider } from "./types/payment.js";
import type { PrintProvider } from "./types/print.js";
import type { Database } from "./types/database.js";
import { createTransport } from "nodemailer";
import { piiSafeLoggerOptions } from "./middleware/pii-sanitizer.js";
import fastifyCors from "@fastify/cors";

function createPaymentProvider(config: ReturnType<typeof loadConfig>): PaymentProvider | null {
  if (!config.TOSS_PAYMENTS_SECRET_KEY || !config.TOSS_PAYMENTS_CLIENT_KEY) {
    console.warn("[server] Toss Payments keys not set — payment routes disabled (prototype mode)"); return null;
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

  if (config.CREATABLE3D_API_KEY) {
    providers.push(new Creatable3DProvider({ apiKey: config.CREATABLE3D_API_KEY }));
  }

  if (config.PRINTON3D_API_KEY) {
    providers.push(new PrintOn3DProvider({ apiKey: config.PRINTON3D_API_KEY }));
  }

  return providers;
}

async function main() {
  const config = loadConfig();
  initSentry(config);

  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
  });
  redis.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  // Try connecting to Redis; if it fails the server still starts
  let redisConnected = false;
  try {
    await redis.connect();
    redisConnected = true;
    console.log("[redis] Connected");
  } catch (err) {
    console.warn("[redis] Initial connection failed — generation queue unavailable:", (err as Error).message);
  }

  const generationQueue  = redisConnected ? createGenerationQueue(redis)  : null;
  const dimensionQueue   = redisConnected ? createDimensionQueue(redis)   : null;
  const paymentProvider  = createPaymentProvider(config);
  const printProviders   = createPrintProviders(config);

  const createContext = createContextFactory({
    supabaseUrl:       config.SUPABASE_URL,
    supabaseServiceKey: config.SUPABASE_SERVICE_KEY,
    supabaseAnonKey:   config.SUPABASE_ANON_KEY,
    generationQueue,
    dimensionQueue,
  });

  const appRouter = createAppRouter(paymentProvider, printProviders);

  const server = Fastify({
    logger: {
      level: "info",
      ...piiSafeLoggerOptions,
    },
  });

  await server.register(fastifyCors, {
    origin: ["http://localhost:4000", "http://localhost:3001", /\.vercel\.app$/, /dpr3d\.kr$/],
    credentials: true,
  });

  // Structured request logging: method, path, statusCode, durationMs
  server.addHook("onResponse", (request, reply, done) => {
    server.log.info(
      {
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed"
    );
    done();
  });

  // Capture unhandled errors in Sentry
  server.setErrorHandler((error, request, reply) => {
    Sentry.captureException(error, {
      tags: { method: request.method, path: request.url },
    });
    server.log.error(error, "unhandled request error");
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    reply.status(statusCode).send({ error: "Internal Server Error" });
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

    if (redisConnected) {
      try {
        await redis.ping();
        services.redis = "ok";
      } catch {
        services.redis = "error";
      }
    } else {
      services.redis = "not_connected";
    }

    const allOk = Object.values(services).every((s) => s === "ok");
    return { status: allOk ? "ok" : "degraded", services };
  });

  // Toss Payments webhook handler
  server.post("/webhooks/toss", async (request, reply) => {
    const signature = (request.headers["x-toss-signature"] as string) ?? "";
    const body = JSON.stringify(request.body);

    try {
      if (!paymentProvider) return reply.code(503).send({ error: "Payment provider not configured" });
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

  // Creatable3D webhook handler
  server.post("/webhooks/creatable3d", async (request, reply) => {
    const signature = (request.headers["x-creatable-signature"] as string) ?? "";
    const body = JSON.stringify(request.body);

    const creatable3dProvider = printProviders.find((p) => p.name === "creatable3d");
    if (!creatable3dProvider) {
      return reply.code(404).send({ error: "Creatable3D provider not configured" });
    }

    try {
      const event = creatable3dProvider.verifyWebhook(body, signature);
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
        .eq("provider_name", "creatable3d");

      return reply.code(200).send({ success: true });
    } catch (err) {
      server.log.error(err, "Creatable3D webhook processing failed");
      return reply.code(400).send({ error: "Invalid webhook" });
    }
  });

  // PrintOn3D webhook handler
  server.post("/webhooks/printon3d", async (request, reply) => {
    const signature = (request.headers["x-printon-signature"] as string) ?? "";
    const body = JSON.stringify(request.body);

    const printon3dProvider = printProviders.find((p) => p.name === "printon3d");
    if (!printon3dProvider) {
      return reply.code(404).send({ error: "PrintOn3D provider not configured" });
    }

    try {
      const event = printon3dProvider.verifyWebhook(body, signature);
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
        .eq("provider_name", "printon3d");

      return reply.code(200).send({ success: true });
    } catch (err) {
      server.log.error(err, "PrintOn3D webhook processing failed");
      return reply.code(400).send({ error: "Invalid webhook" });
    }
  });

  // ── REST adapter (bridges frontend api.ts to tRPC logic) ──────────────────
  const db = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

  /**
   * Decode a Supabase JWT and return { id, email } without a network round-trip.
   * We trust the JWT is Supabase-issued; expiry is checked locally.
   */
  const getUser = (authHeader: string | undefined): { id: string; email: string } | null => {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    try {
      const parts = token.split(".");
      const payloadB64 = parts[1];
      if (!payloadB64) return null;
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) return null;
      return { id: payload.sub as string, email: (payload.email ?? "") as string };
    } catch {
      return null;
    }
  };

  server.post("/generate", async (request, reply) => {
    const user = await getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const { prompt } = request.body as { prompt: string };
    
    if (!generationQueue) return reply.code(503).send({ error: "Generation queue unavailable" });
    const { data: model, error } = await db.from("models")
      .insert({ prompt, status: "queued", user_id: user.id }).select("id").single();
    if (error || !model) return reply.code(500).send({ error: error?.message });
    await generationQueue.add("text-to-3d", { modelId: model.id, prompt });
    return { id: model.id, status: "pending" };
  });

  server.get("/models", async (request, reply) => {
    const user = await getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const { data } = await db.from("models").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    return data ?? [];
  });

  server.get<{ Params: { id: string } }>("/models/:id", async (request, reply) => {
    const user = await getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const { data } = await db.from("models").select("*")
      .eq("id", request.params.id).eq("user_id", user.id).single();
    if (!data) return reply.code(404).send({ error: "Not found" });
    return { id: data.id, status: data.status, prompt: data.prompt,
      stlUrl: data.file_url, sourceImageUrl: data.source_image_url ?? null,
      createdAt: data.created_at };
  });

  // GET /print-providers — list all active print providers with capabilities
  server.get("/print-providers", async (request, reply) => {
    // Public endpoint: no auth required for provider listing
    const { data: providers } = await db
      .from("print_providers")
      .select("*")
      .eq("active", true)
      .order("min_lead_days", { ascending: true });

    if (!providers || providers.length === 0) {
      // Fallback: derive from configured providers
      return {
        providers: printProviders.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          location: "Korea",
          supportsApi: true,
          materials: ["PLA", "ABS", "PETG", "Resin", "Nylon", "TPU", "Metal"],
          minLeadDays: 3,
          active: true,
        })),
      };
    }

    return {
      providers: providers.map((p) => ({
        name: p.name,
        displayName: p.display_name,
        displayNameKo: p.display_name_ko,
        description: p.description,
        descriptionKo: p.description_ko,
        location: p.location,
        supportsApi: p.supports_api,
        supportsWebhook: p.supports_webhook,
        materials: p.materials,
        minLeadDays: p.min_lead_days,
        active: p.active,
      })),
    };
  });

  // GET /models/:id/quotes — get live quotes from all providers for a model
  server.get<{ Params: { id: string }; Querystring: { material?: string; quantity?: string } }>(
    "/models/:id/quotes",
    async (request, reply) => {
      const user = await getUser(request.headers.authorization);
      if (!user) return reply.code(401).send({ error: "Unauthorized" });

      const { data: model } = await db
        .from("models")
        .select("id, file_url, status")
        .eq("id", request.params.id)
        .eq("user_id", user.id)
        .single();

      if (!model) return reply.code(404).send({ error: "Model not found" });
      if (!model.file_url) return reply.code(400).send({ error: "Model file not ready" });

      const material = (request.query.material ?? "PLA") as string;
      const quantity = parseInt(request.query.quantity ?? "1", 10) || 1;

      // Request quotes from all providers in parallel
      const quoteResults = await Promise.allSettled(
        printProviders.map((provider) =>
          provider.getQuote({
            modelFileUrl: model.file_url!,
            material: material as any,
            quantity,
          })
        )
      );

      const quotes = quoteResults
        .filter(
          (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof printProviders[number]["getQuote"]>>> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value)
        .sort((a, b) => a.priceKrw - b.priceKrw);

      return {
        modelId: request.params.id,
        material,
        quantity,
        quotes,
      };
    }
  );

  server.get("/orders", async (request, reply) => {
    const user = await getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    const { data } = await db.from("orders").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    return data ?? [];
  });
  // ────────────────────────────────────────────────────────────────────────────

  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${config.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
