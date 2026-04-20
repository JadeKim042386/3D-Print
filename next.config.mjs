import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps only when SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  // Disables Sentry SDK build-time telemetry
  disableLogger: true,
});
