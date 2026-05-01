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
import { createExportQueue } from "./queue/export-queue.js";
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
import { createMailer } from "./lib/mailer.js";
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
  const exportQueue      = redisConnected ? createExportQueue(redis)      : null;
  const paymentProvider  = createPaymentProvider(config);
  const printProviders   = createPrintProviders(config);
  const mailer           = createMailer(config);

  const createContext = createContextFactory({
    supabaseUrl:       config.SUPABASE_URL,
    supabaseServiceKey: config.SUPABASE_SERVICE_KEY,
    supabaseAnonKey:   config.SUPABASE_ANON_KEY,
    generationQueue,
    dimensionQueue,
    exportQueue,
    mailer,
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
      createdAt: data.created_at,
      meshQuality: data.triangle_count != null
        ? {
            triangleCount: data.triangle_count,
            printabilityScore: data.printability_score,
            volume_mm3: data.mesh_volume_mm3,
            surfaceArea_mm2: data.mesh_surface_area_mm2,
          }
        : null,
    };
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

  // POST /orders — create a Toss payment order
  server.post<{
    Body: {
      modelId: string;
      providerId: string;
      providerName?: string;
      materialId: string;
      materialName?: string;
      estimatedDays?: number;
      amount: number;
      orderName: string;
      paymentMethod: string;
    };
  }>("/orders", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const {
      modelId, providerId, providerName, materialId, materialName,
      estimatedDays, amount, orderName, paymentMethod,
    } = request.body;

    if (!modelId || !providerId || !materialId || !amount || !orderName) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    // Verify model belongs to user
    const { data: model } = await db.from("models")
      .select("id").eq("id", modelId).eq("user_id", user.id).single();
    if (!model) return reply.code(404).send({ error: "Model not found" });

    // Create order via payment provider (gets orderId + clientKey)
    if (!paymentProvider) {
      return reply.code(503).send({ error: "Payment provider not configured" });
    }
    const providerResult = await paymentProvider.createOrder({
      modelId,
      amount,
      orderName,
      customerName: user.email.split("@")[0]!,
      customerEmail: user.email,
    });

    const { data: order, error } = await db.from("orders").insert({
      user_id: user.id,
      model_id: modelId,
      status: "pending",
      total_price_krw: amount,
      order_name: orderName,
      payment_provider: paymentProvider.name,
      payment_status: "READY",
      payment_method: paymentMethod,
      customer_name: user.email.split("@")[0]!,
      customer_email: user.email,
      print_provider: providerId,
      provider_name: providerName ?? providerId,
      material_id: materialId,
      material_name: materialName ?? materialId,
      estimated_days: estimatedDays ?? null,
    }).select("id").single();

    if (error || !order) {
      return reply.code(500).send({ error: error?.message ?? "Failed to create order" });
    }

    return {
      id: order.id,
      status: "pending",
      modelId,
      providerId,
      providerName: providerName ?? providerId,
      materialName: materialName ?? materialId,
      priceKrw: amount,
      estimatedDays: estimatedDays ?? 0,
      paymentMethod,
      createdAt: new Date().toISOString(),
      checkoutData: providerResult.checkoutData,
    };
  });

  // GET /orders/:id — get a single order
  server.get<{ Params: { id: string } }>("/orders/:id", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { data: order } = await db.from("orders").select("*")
      .eq("id", request.params.id).eq("user_id", user.id).single();
    if (!order) return reply.code(404).send({ error: "Order not found" });

    return {
      id: order.id,
      status: order.status,
      modelId: order.model_id,
      providerId: order.print_provider ?? "",
      providerName: order.provider_name ?? order.print_provider ?? "",
      materialName: order.material_name ?? "",
      priceKrw: order.total_price_krw ?? 0,
      estimatedDays: order.estimated_days ?? 0,
      paymentMethod: order.payment_method ?? "card",
      tossPaymentKey: order.payment_key ?? undefined,
      createdAt: order.created_at,
    };
  });

  // POST /orders/:id/confirm — confirm Toss payment after redirect
  server.post<{
    Params: { id: string };
    Body: { paymentKey: string };
  }>("/orders/:id/confirm", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { paymentKey } = request.body;
    if (!paymentKey) return reply.code(400).send({ error: "Missing paymentKey" });

    const { data: order } = await db.from("orders").select("*")
      .eq("id", request.params.id).eq("user_id", user.id).single();
    if (!order) return reply.code(404).send({ error: "Order not found" });
    if (order.status !== "pending") {
      return reply.code(400).send({ error: "Order already processed" });
    }

    if (!paymentProvider) {
      return reply.code(503).send({ error: "Payment provider not configured" });
    }

    const result = await paymentProvider.confirmPayment({
      orderId: order.id,
      paymentKey,
      amount: order.total_price_krw!,
    });

    await db.from("orders").update({
      payment_key: result.paymentKey,
      payment_method: result.method,
      payment_status: result.status,
      status: "confirmed",
      approved_at: result.approvedAt,
      receipt_url: result.receiptUrl,
    }).eq("id", order.id);

    return {
      id: order.id,
      status: "confirmed",
      modelId: order.model_id,
      providerId: order.print_provider ?? "",
      providerName: order.provider_name ?? order.print_provider ?? "",
      materialName: order.material_name ?? "",
      priceKrw: order.total_price_krw ?? 0,
      estimatedDays: order.estimated_days ?? 0,
      paymentMethod: result.method ?? order.payment_method ?? "card",
      tossPaymentKey: result.paymentKey,
      createdAt: order.created_at,
    };
  });

  // ── Model Export REST endpoints ───────────────────────────────────────────
  server.post<{
    Params: { id: string };
    Body: { format: string };
  }>("/models/:id/export", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const validFormats = ["stl", "obj", "glb", "gltf", "3mf"] as const;
    type ValidFormat = typeof validFormats[number];
    const rawFormat = request.body?.format;
    if (!rawFormat || !validFormats.includes(rawFormat as ValidFormat)) {
      return reply.code(400).send({ error: "Invalid format. Supported: stl, obj, glb, gltf, 3mf" });
    }
    const format = rawFormat as ValidFormat;

    const { data: model } = await db.from("models").select("id, file_url, format, user_id, status")
      .eq("id", request.params.id).eq("user_id", user.id).single();

    if (!model) return reply.code(404).send({ error: "Model not found" });
    if (model.status !== "ready" || !model.file_url) {
      return reply.code(400).send({ error: "Model not ready" });
    }

    const sourceFormat = (model.format ?? "glb") as "stl" | "glb";

    // Same format: return original
    if (format === sourceFormat || (format === "gltf" && sourceFormat === "glb")) {
      return { status: "ready", format, fileUrl: model.file_url };
    }

    // Check existing export
    const { data: existing } = await db.from("model_exports")
      .select("id, status, file_url")
      .eq("model_id", model.id).eq("format", format).single();

    if (existing) {
      return { exportId: existing.id, status: existing.status, format, fileUrl: existing.file_url };
    }

    // Create new export
    const { data: exportRecord, error: insertError } = await db.from("model_exports")
      .insert({ model_id: model.id, format, status: "pending" })
      .select("id").single();

    if (insertError || !exportRecord) {
      return reply.code(500).send({ error: insertError?.message ?? "Export creation failed" });
    }

    if (!exportQueue) {
      return reply.code(503).send({ error: "Export queue unavailable" });
    }

    await exportQueue.add("format-convert", {
      exportId: exportRecord.id,
      modelId: model.id,
      sourceFileUrl: model.file_url,
      sourceFormat,
      targetFormat: format as "stl" | "obj" | "glb" | "gltf" | "3mf",
    });

    return { exportId: exportRecord.id, status: "pending", format, fileUrl: null };
  });

  server.get<{
    Params: { id: string };
  }>("/models/:id/exports", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { data: model } = await db.from("models").select("id, file_url, format, user_id")
      .eq("id", request.params.id).eq("user_id", user.id).single();

    if (!model) return reply.code(404).send({ error: "Model not found" });

    const { data: exports } = await db.from("model_exports")
      .select("id, format, status, file_url, file_size_bytes")
      .eq("model_id", model.id).order("created_at", { ascending: true });

    return {
      modelId: model.id,
      sourceFormat: model.format ?? "glb",
      sourceFileUrl: model.file_url,
      exports: exports ?? [],
    };
  });
  // ────────────────────────────────────────────────────────────────────────────

  // ── Gallery & Public Model routes ─────────────────────────────────────────

  server.get<{ Querystring: { page?: string; pageSize?: string } }>("/gallery", async (request, reply) => {
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(request.query.pageSize ?? "12", 10) || 12));
    const offset = (page - 1) * pageSize;

    const { data, count } = await db
      .from("models")
      .select("id, prompt, file_url, thumbnail_url, created_at", { count: "exact" })
      .eq("is_public", true)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    return {
      models: (data ?? []).map((m) => ({
        id: m.id,
        prompt: m.prompt,
        stlUrl: m.file_url,
        isPublic: true,
        createdAt: m.created_at,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  });

  server.get<{ Params: { id: string } }>("/models/:id/public", async (request, reply) => {
    const { data } = await db
      .from("models")
      .select("id, prompt, file_url, created_at")
      .eq("id", request.params.id)
      .eq("is_public", true)
      .single();

    if (!data) return reply.code(404).send({ error: "Not found" });

    return { id: data.id, prompt: data.prompt, stlUrl: data.file_url, isPublic: true, createdAt: data.created_at };
  });

  server.patch<{ Params: { id: string }; Body: { isPublic: boolean } }>("/models/:id/visibility", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { data: owned } = await db.from("models").select("id").eq("id", request.params.id).eq("user_id", user.id).single();
    if (!owned) return reply.code(404).send({ error: "Model not found" });

    const { data: updated, error } = await db
      .from("models")
      .update({ is_public: request.body.isPublic })
      .eq("id", request.params.id)
      .select("id, status, prompt, file_url, source_image_url, created_at, is_public, triangle_count, printability_score, mesh_volume_mm3, mesh_surface_area_mm2")
      .single();

    if (error || !updated) return reply.code(500).send({ error: error?.message });

    return {
      id: updated.id,
      status: updated.status,
      prompt: updated.prompt,
      stlUrl: updated.file_url,
      sourceImageUrl: updated.source_image_url ?? null,
      isPublic: updated.is_public,
      createdAt: updated.created_at,
      meshQuality: updated.triangle_count != null ? {
        triangleCount: updated.triangle_count,
        printabilityScore: updated.printability_score,
        volume_mm3: updated.mesh_volume_mm3,
        surfaceArea_mm2: updated.mesh_surface_area_mm2,
      } : null,
    };
  });

  // ── Credits & Subscription routes ─────────────────────────────────────────

  server.get("/credits/balance", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { data } = await db
      .from("user_credits")
      .select("credits_used, credits_limit, plan_id, period_end")
      .eq("user_id", user.id)
      .single();

    if (!data) {
      return { used: 0, total: 10, remaining: 10, plan: "free", resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
    }

    return {
      used: data.credits_used,
      total: data.credits_limit,
      remaining: Math.max(0, data.credits_limit - data.credits_used),
      plan: data.plan_id,
      resetAt: data.period_end,
    };
  });

  server.get("/subscription", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { data } = await db
      .from("user_credits")
      .select("plan_id, period_start, period_end")
      .eq("user_id", user.id)
      .single();

    if (!data || data.plan_id === "free") return reply.code(404).send({ error: "No active subscription" });

    const status = new Date(data.period_end) > new Date() ? "active" : "expired";

    return {
      plan: data.plan_id,
      status,
      currentPeriodStart: data.period_start,
      currentPeriodEnd: data.period_end,
      cancelAtPeriodEnd: false,
      tossCustomerId: null,
    };
  });

  server.post<{ Body: { plan: string } }>("/subscription/checkout", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    if (!paymentProvider) return reply.code(503).send({ error: "Payment provider not configured" });

    const { plan } = request.body ?? {};
    if (!plan || plan === "free") return reply.code(400).send({ error: "Invalid plan" });

    const { data: planData } = await db.from("subscription_plans").select("id, name, price_krw").eq("id", plan).single();
    if (!planData) return reply.code(404).send({ error: "Plan not found" });

    const result = await paymentProvider.createOrder({
      modelId: `sub-${user.id}-${plan}`,
      amount: planData.price_krw,
      orderName: `구독 업그레이드 - ${planData.name}`,
      customerName: user.email.split("@")[0]!,
      customerEmail: user.email,
    });

    return { checkoutUrl: result.checkoutData["checkoutUrl"] ?? "", orderId: result.orderId };
  });

  server.post("/subscription/cancel", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const { error } = await db
      .from("user_credits")
      .update({ plan_id: "free", period_end: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) return reply.code(500).send({ error: error.message });

    return reply.code(204).send();
  });

  server.post<{ Body: { credits: number } }>("/credits/topup", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    if (!paymentProvider) return reply.code(503).send({ error: "Payment provider not configured" });

    const { credits } = request.body ?? {};
    if (!credits || credits <= 0) return reply.code(400).send({ error: "Invalid credits amount" });

    const pricePerCredit = 1000;
    const result = await paymentProvider.createOrder({
      modelId: `topup-${user.id}-${Date.now()}`,
      amount: credits * pricePerCredit,
      orderName: `크레딧 충전 ${credits}개`,
      customerName: user.email.split("@")[0]!,
      customerEmail: user.email,
    });

    return { checkoutUrl: result.checkoutData["checkoutUrl"] ?? "", orderId: result.orderId };
  });

  // GET /generations — paginated generation history (backed by models table)
  server.get<{ Querystring: { page?: string; pageSize?: string } }>("/generations", async (request, reply) => {
    const user = getUser(request.headers.authorization);
    if (!user) return reply.code(401).send({ error: "Unauthorized" });

    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const { data, count } = await db
      .from("models")
      .select("id, prompt, source_image_url, status, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    const statusMap: Record<string, "pending" | "processing" | "ready" | "error"> = {
      queued: "pending", processing: "processing", ready: "ready", failed: "error",
    };

    return {
      generations: (data ?? []).map((m) => ({
        id: m.id,
        prompt: m.prompt,
        sourceImageUrl: m.source_image_url ?? null,
        status: statusMap[m.status] ?? "processing",
        creditsUsed: 1,
        createdAt: m.created_at,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  });

  // ── Analytics event ingestion (best-effort, no auth required) ─────────────
  server.post("/analytics/event", async (request, reply) => {
    const { event, properties } = request.body as {
      event?: string;
      properties?: Record<string, unknown>;
    };
    if (!event) return reply.code(400).send({ error: "Missing event" });

    const user = getUser(request.headers.authorization);

    await db.from("analytics_events").insert({
      user_id: user?.id ?? null,
      event_name: event,
      properties: (properties ?? {}) as Database["public"]["Tables"]["analytics_events"]["Insert"]["properties"],
    });

    return { ok: true };
  });
  // ────────────────────────────────────────────────────────────────────────────

  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${config.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
