"use client";

import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCreditsBalance, getSubscription, createCheckoutSession, type SubscriptionPlan } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";
import { analytics } from "@/lib/analytics";

const PLANS: Array<{
  id: SubscriptionPlan;
  priceKey: string;
  creditsKey: string;
  estimateKey: string;
  features: string[];
  highlight: boolean;
}> = [
  {
    id: "free",
    priceKey: "pricing.freePriceKrw",
    creditsKey: "pricing.freeCredits",
    estimateKey: "pricing.freeEstimate",
    features: ["feature_3d_gen", "feature_viewer", "feature_history"],
    highlight: false,
  },
  {
    id: "pro",
    priceKey: "pricing.proPriceKrw",
    creditsKey: "pricing.proCredits",
    estimateKey: "pricing.proEstimate",
    features: ["feature_3d_gen", "feature_viewer", "feature_history", "feature_print", "feature_priority", "feature_watermark"],
    highlight: true,
  },
  {
    id: "business",
    priceKey: "pricing.businessPriceKrw",
    creditsKey: "pricing.businessCredits",
    estimateKey: "pricing.businessEstimate",
    features: ["feature_3d_gen", "feature_viewer", "feature_history", "feature_print", "feature_priority", "feature_watermark", "feature_api", "feature_support"],
    highlight: false,
  },
];

function FeatureTooltip({ featureKey }: { featureKey: string }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const tooltipKey = `pricing.${featureKey}_tip`;
  const tip = t(tooltipKey);
  if (tip === tooltipKey) return null;

  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] text-gray-500 hover:bg-gray-300"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label={tip}
      >
        ?
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 z-10 mb-1.5 w-48 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
          {tip}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: credits } = useQuery({
    queryKey: ["credits-balance", accessToken],
    queryFn: () => getCreditsBalance(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", accessToken],
    queryFn: () => getSubscription(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: (plan: Exclude<SubscriptionPlan, "free">) =>
      createCheckoutSession(plan, accessToken!),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
  });

  const currentPlan: SubscriptionPlan = subscription?.plan ?? credits?.plan ?? "free";

  const handlePlanClick = (planId: SubscriptionPlan) => {
    if (!accessToken) {
      window.location.href = "/auth";
      return;
    }
    if (planId === "free") return;
    analytics.planUpgradeClicked(planId);
    checkoutMutation.mutate(planId as Exclude<SubscriptionPlan, "free">);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-3xl font-bold text-gray-900">{t("pricing.title")}</h1>
        <p className="text-gray-600">{t("pricing.subtitle")}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isUpgrade =
            (currentPlan === "free" && plan.id !== "free") ||
            (currentPlan === "pro" && plan.id === "business");

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlight
                  ? "border-gray-900 shadow-lg"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
                  {t("pricing.mostPopular")}
                </span>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {t(`pricing.${plan.id}`)}
                </h2>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-3xl font-bold text-gray-900">
                    {t(plan.priceKey)}
                  </span>
                  {plan.id !== "free" && (
                    <span className="mb-1 text-sm text-gray-500">{t("pricing.perMonth")}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-blue-600 font-medium">{t(plan.creditsKey)}</p>
                <p className="mt-0.5 text-xs text-gray-500">{t(plan.estimateKey)}</p>
              </div>

              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-green-500">&#x2713;</span>
                    {t(`pricing.${feat}`)}
                    <FeatureTooltip featureKey={feat} />
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <span className="flex items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 min-h-[44px]">
                  {t("pricing.currentPlan")}
                </span>
              ) : isUpgrade ? (
                <button
                  onClick={() => handlePlanClick(plan.id)}
                  disabled={checkoutMutation.isPending}
                  className="flex items-center justify-center rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 min-h-[44px] transition-colors"
                >
                  {checkoutMutation.isPending && checkoutMutation.variables === plan.id
                    ? "..."
                    : t("pricing.upgrade")}
                </button>
              ) : plan.id === "free" ? (
                accessToken ? (
                  <span className="flex items-center justify-center rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-400 min-h-[44px]">
                    {t("pricing.currentPlan")}
                  </span>
                ) : (
                  <Link
                    href="/auth"
                    className="flex items-center justify-center rounded-lg border border-gray-900 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 min-h-[44px] transition-colors"
                  >
                    {t("pricing.startFree")}
                  </Link>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      {checkoutMutation.isError && (
        <p className="mt-6 text-center text-sm text-red-600" role="alert">
          {t("error.pageDescription")}
        </p>
      )}

      <p className="mt-8 text-center text-xs text-gray-400">
        {t("pricing.checkoutDesc")}
      </p>
    </main>
  );
}
