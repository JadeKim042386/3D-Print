"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { createCheckoutSession, createCreditTopupSession, type SubscriptionPlan } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const PLANS: Array<{
  id: Exclude<SubscriptionPlan, "free">;
  priceKey: string;
  creditsKey: string;
  estimateKey: string;
  highlight: boolean;
}> = [
  {
    id: "pro",
    priceKey: "pricing.proPriceKrw",
    creditsKey: "pricing.proCredits",
    estimateKey: "pricing.proEstimate",
    highlight: true,
  },
  {
    id: "business",
    priceKey: "pricing.businessPriceKrw",
    creditsKey: "pricing.businessCredits",
    estimateKey: "pricing.businessEstimate",
    highlight: false,
  },
];

function TopupButton({ credits, accessToken }: { credits: number; accessToken: string | null }) {
  const { t } = useTranslation();
  const topupMutation = useMutation({
    mutationFn: () => createCreditTopupSession(credits, accessToken!),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
  });

  const priceKrw = (credits * 1990).toLocaleString("ko-KR");

  return (
    <button
      onClick={() => topupMutation.mutate()}
      disabled={topupMutation.isPending || !accessToken}
      className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-center hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      <p className="text-sm font-semibold text-gray-900">
        {credits} {t("credits.balance")}
      </p>
      <p className="text-[10px] text-gray-500">{"\u20A9"}{priceKrw}</p>
    </button>
  );
}

export default function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const checkoutMutation = useMutation({
    mutationFn: (plan: Exclude<SubscriptionPlan, "free">) =>
      createCheckoutSession(plan, accessToken!),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-xl">
            &#x1F680;
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t("credits.upgradeLater")}
          >
            &#x2715;
          </button>
        </div>

        <h2
          id="upgrade-modal-title"
          className="mb-2 text-lg font-bold text-gray-900"
        >
          {t("credits.exhausted")}
        </h2>
        <p className="mb-5 text-sm text-gray-600">{t("credits.exhaustedDesc")}</p>

        <div className="mb-4 space-y-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-4 ${
                plan.highlight
                  ? "border-gray-900 shadow-sm"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-gray-900 px-2.5 py-0.5 text-[10px] font-medium text-white">
                  {t("pricing.mostPopular")}
                </span>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t(`pricing.${plan.id}`)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t(plan.creditsKey)}
                    <span className="mx-1 text-gray-300">|</span>
                    {t(plan.estimateKey)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {t(plan.priceKey)}
                  </p>
                  <p className="text-[10px] text-gray-400">{t("pricing.perMonth")}</p>
                </div>
              </div>
              <button
                onClick={() => checkoutMutation.mutate(plan.id)}
                disabled={checkoutMutation.isPending}
                className={`mt-3 flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] transition-colors ${
                  plan.highlight
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                } disabled:opacity-50`}
              >
                {checkoutMutation.isPending && checkoutMutation.variables === plan.id
                  ? "..."
                  : t("pricing.upgrade")}
              </button>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-xl border border-dashed border-gray-300 p-3">
          <p className="mb-2 text-xs font-medium text-gray-700">
            {t("credits.topupTitle")}
          </p>
          <div className="flex gap-2">
            {[10, 25, 50].map((amount) => (
              <TopupButton key={amount} credits={amount} accessToken={accessToken} />
            ))}
          </div>
        </div>

        {checkoutMutation.isError && (
          <p className="mb-3 text-center text-xs text-red-600" role="alert">
            {t("error.pageDescription")}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 min-h-[44px]"
        >
          {t("credits.upgradeLater")}
        </button>
      </div>
    </div>
  );
}
