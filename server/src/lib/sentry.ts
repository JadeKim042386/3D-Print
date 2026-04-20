import * as Sentry from "@sentry/node";
import type { Config } from "../config.js";
import { redactPii } from "../middleware/pii-sanitizer.js";

export function initSentry(config: Config): void {
  if (!config.SENTRY_DSN) return;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  // Scrub user PII
  if (event.user) {
    event.user = {
      id: event.user.id,
    };
  }

  // Scrub request data
  if (event.request) {
    if (event.request.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    if (event.request.data) {
      event.request.data = redactPii(event.request.data) as string;
    }
  }

  // Scrub breadcrumb data
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => {
      if (bc.data) {
        bc.data = redactPii(bc.data) as Record<string, unknown>;
      }
      return bc;
    });
  }

  return event;
}

export { Sentry };
