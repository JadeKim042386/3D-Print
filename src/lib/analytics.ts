import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (POSTHOG_KEY) {
    posthog.capture(event, properties);
  }
  // Also fire to our backend for the analytics_events table
  sendServerEvent(event, properties).catch(() => {});
}

async function sendServerEvent(event: string, properties?: Record<string, unknown>) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
  try {
    await fetch(`${API_BASE}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties }),
      keepalive: true,
    });
  } catch {
    // Best-effort, don't block UI
  }
}

// Funnel event helpers
export const analytics = {
  pageView: (page: string) => trackEvent("page_view", { page }),
  signup: () => trackEvent("signup_completed"),
  generationSubmitted: (type: "text" | "image") => trackEvent("generation_submitted", { type }),
  generationCompleted: (modelId: string) => trackEvent("generation_completed", { modelId }),
  modelDownloaded: (modelId: string, format: string) => trackEvent("model_downloaded", { modelId, format }),
  orderPlaced: (orderId: string, priceKrw: number) => trackEvent("order_placed", { orderId, priceKrw }),
  paymentCompleted: (orderId: string, priceKrw: number) => trackEvent("payment_completed", { orderId, priceKrw }),
  planUpgradeClicked: (plan: string) => trackEvent("plan_upgrade_clicked", { plan }),
  planUpgraded: (fromPlan: string, toPlan: string) => trackEvent("plan_upgraded", { fromPlan, toPlan }),
  creditExhausted: () => trackEvent("credits_exhausted"),
};
