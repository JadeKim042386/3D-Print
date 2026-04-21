import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/node before importing our module
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { initSentry } from "../lib/sentry.js";
import type { Config } from "../config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    REDIS_URL: "redis://localhost:6379",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_KEY: "service-key",
    SUPABASE_ANON_KEY: "anon-key",
    MESHY_API_KEY: "meshy-key",
    STORAGE_BUCKET: "models",
    PORT: 3000,
    KAKAOPAY_CID: "TC0ONETIME",
    POSTHOG_HOST: "https://us.i.posthog.com",
    SENTRY_ENVIRONMENT: "test",
    ...overrides,
  };
}

describe("initSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not initialize Sentry when DSN is not set", () => {
    initSentry(makeConfig({ SENTRY_DSN: undefined }));
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initializes Sentry when DSN is provided", () => {
    initSentry(makeConfig({ SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0" }));
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        environment: "test",
        tracesSampleRate: 0.2,
      })
    );
  });

  it("includes beforeSend hook that scrubs user PII", () => {
    initSentry(makeConfig({ SENTRY_DSN: "https://key@sentry.io/0" }));

    const initCall = vi.mocked(Sentry.init).mock.calls[0]![0]!;
    const beforeSend = initCall.beforeSend as (
      event: Sentry.ErrorEvent
    ) => Sentry.ErrorEvent | null;

    const event = beforeSend({
      user: {
        id: "user-123",
        email: "user@example.com",
        username: "Kim",
        ip_address: "1.2.3.4",
      },
      request: {
        headers: {
          authorization: "Bearer token",
          cookie: "session=abc",
          "content-type": "application/json",
        },
        data: JSON.stringify({ email: "test@test.com", name: "Kim" }),
      },
    } as unknown as Sentry.ErrorEvent);

    // User should only retain id
    expect(event!.user).toEqual({ id: "user-123" });

    // Auth headers should be stripped
    expect(event!.request!.headers!.authorization).toBeUndefined();
    expect(event!.request!.headers!.cookie).toBeUndefined();
    expect(event!.request!.headers!["content-type"]).toBe("application/json");
  });
});
