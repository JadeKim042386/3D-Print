import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0.2,
  beforeSend(event) {
    if (event.user) {
      event.user = { id: event.user.id };
    }
    return event;
  },
});
