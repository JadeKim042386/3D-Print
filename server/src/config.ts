import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SUPABASE_URL: z.string(),
  SUPABASE_SERVICE_KEY: z.string(),
  SUPABASE_ANON_KEY: z.string(),
  MESHY_API_KEY: z.string(),
  STORAGE_BUCKET: z.string().default("models"),
  PORT: z.coerce.number().default(3000),
  // Toss Payments (sandbox by default)
  TOSS_PAYMENTS_SECRET_KEY: z.string().optional(),
  TOSS_PAYMENTS_CLIENT_KEY: z.string().optional(),
  TOSS_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  // KakaoPay
  KAKAOPAY_SECRET_KEY: z.string().optional(),
  KAKAOPAY_CID: z.string().default("TC0ONETIME"),
  // Print providers
  THREEDLINE_ORDER_EMAIL: z.string().email().optional(),
  CRAFTCLOUD_API_KEY: z.string().optional(),
  // Email (for print order notifications)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  return envSchema.parse(process.env);
}
