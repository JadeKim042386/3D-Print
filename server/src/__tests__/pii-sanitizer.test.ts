import { describe, it, expect } from "vitest";
import { redactPii, piiSafeLoggerOptions } from "../middleware/pii-sanitizer.js";

describe("redactPii", () => {
  it("redacts email addresses in strings", () => {
    expect(redactPii("contact user@example.com for info")).toBe(
      "contact [EMAIL] for info"
    );
  });

  it("redacts Korean phone numbers", () => {
    expect(redactPii("call 010-1234-5678")).toBe("call [PHONE]");
    expect(redactPii("call +82-10-1234-5678")).toBe("call [PHONE]");
  });

  it("redacts known PII field names in objects", () => {
    const result = redactPii({
      email: "user@test.com",
      phone: "010-1234-5678",
      name: "Kim",
      shipping_address: "Seoul, Korea",
      ip_address: "1.2.3.4",
      user_agent: "Mozilla/5.0",
      status: "active",
    }) as Record<string, unknown>;

    expect(result.email).toBe("[REDACTED]");
    expect(result.phone).toBe("[REDACTED]");
    expect(result.name).toBe("[REDACTED]");
    expect(result.shipping_address).toBe("[REDACTED]");
    expect(result.ip_address).toBe("[REDACTED]");
    expect(result.user_agent).toBe("[REDACTED]");
    expect(result.status).toBe("active");
  });

  it("does not redact filename or hostname or provider_name", () => {
    const result = redactPii({
      filename: "model.stl",
      hostname: "api.example.com",
      provider_name: "meshy",
    }) as Record<string, unknown>;

    expect(result.filename).toBe("model.stl");
    expect(result.hostname).toBe("api.example.com");
    expect(result.provider_name).toBe("meshy");
  });

  it("recursively redacts nested objects", () => {
    const result = redactPii({
      user: { email: "a@b.com", id: "123" },
    }) as Record<string, unknown>;

    const user = result.user as Record<string, unknown>;
    expect(user.id).toBe("123");
    // email key is redacted
    expect(user.email).toBe("[REDACTED]");
  });

  it("handles arrays", () => {
    const result = redactPii(["hello user@test.com", "no pii here"]);
    expect(result).toEqual(["hello [EMAIL]", "no pii here"]);
  });

  it("handles null and undefined", () => {
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
  });
});

describe("piiSafeLoggerOptions", () => {
  it("serializes request with redacted remoteAddress", () => {
    const req = piiSafeLoggerOptions.serializers.req({
      method: "GET",
      url: "/health",
      hostname: "api.example.com",
    });

    expect(req).toEqual({
      method: "GET",
      url: "/health",
      hostname: "api.example.com",
      remoteAddress: "[REDACTED]",
    });
  });

  it("serializes response with statusCode only", () => {
    const res = piiSafeLoggerOptions.serializers.res({ statusCode: 200 });
    expect(res).toEqual({ statusCode: 200 });
  });
});
