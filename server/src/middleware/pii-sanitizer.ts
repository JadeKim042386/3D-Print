import type { FastifyRequest, FastifyReply } from "fastify";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\b(0\d{1,2}-?\d{3,4}-?\d{4}|\+82-?\d{1,2}-?\d{3,4}-?\d{4})\b/g;

/** Recursively redact PII from an object for logging purposes. */
export function redactPii(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj.replace(EMAIL_REGEX, "[EMAIL]").replace(PHONE_REGEX, "[PHONE]");
  }
  if (Array.isArray(obj)) return obj.map(redactPii);
  if (typeof obj === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lk = key.toLowerCase();
      if (
        lk.includes("email") ||
        lk.includes("phone") ||
        lk.includes("name") && !lk.includes("filename") && !lk.includes("hostname") && !lk.includes("provider_name") ||
        lk === "shipping_address" ||
        lk === "shippingaddress" ||
        lk === "ip_address" ||
        lk === "user_agent"
      ) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactPii(value);
      }
    }
    return redacted;
  }
  return obj;
}

/** Fastify serializer options that redact PII from request logs. */
export const piiSafeLoggerOptions = {
  serializers: {
    req(request: { method?: string; url?: string; hostname?: string }) {
      return {
        method: request.method,
        url: request.url,
        hostname: request.hostname,
        remoteAddress: "[REDACTED]",
      };
    },
    res(reply: { statusCode?: number }) {
      return {
        statusCode: reply.statusCode,
      };
    },
  },
};
