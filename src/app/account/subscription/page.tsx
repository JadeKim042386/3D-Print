"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { getSubscription, getCreditsBalance, cancelSubscription } from "@/lib/api";

function formatDate(dateString: string, lang: string): string {
  const date = new Date(dateString);
  if (lang === "ko") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<"success" | "error" | null>(null);

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", accessToken],
    queryFn: () => getSubscription(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const { data: credits, isLoading: credLoading } = useQuery({
    queryKey: ["credits-balance", accessToken],
    queryFn: () => getCreditsBalance(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription(accessToken!),
    onSuccess: () => {
      setCancelFeedback("success");
      setShowCancelConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: () => {
      setCancelFeedback("error");
      setShowCancelConfirm(false);
    },
  });

  if (!accessToken) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">{t("subscription.loginRequired")}</h1>
        <p className="mb-6 text-gray-600">{t("subscription.loginDescription")}</p>
        <Link
          href="/auth"
          className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
        >
          {t("subscription.goToLogin")}
        </Link>
      </main>
    );
  }

  const isLoading = subLoading || credLoading;

  const planLabelKey =
    subscription?.plan === "pro"
      ? "subscription.pro"
      : subscription?.plan === "business"
      ? "subscription.business"
      : "subscription.free";

  const statusLabelKey =
    subscription?.status === "cancelled"
      ? "subscription.statusCancelled"
      : subscription?.status === "expired"
      ? "subscription.statusExpired"
      : "subscription.statusActive";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("subscription.title")}</h1>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {/* Plan summary card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {t("subscription.currentPlan")}
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{t(planLabelKey)}</p>
              </div>
              {subscription && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    subscription.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t(statusLabelKey)}
                </span>
              )}
            </div>

            {credits && (
              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t("subscription.creditsUsed")}</span>
                  <span className="font-medium text-gray-900">
                    {credits.used} / {credits.total}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      credits.remaining === 0
                        ? "bg-red-500"
                        : credits.remaining <= 3
                        ? "bg-orange-400"
                        : "bg-gray-900"
                    }`}
                    style={{
                      width: `${Math.min(100, (credits.used / credits.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {subscription?.currentPeriodEnd && (
              <p className="text-sm text-gray-500">
                {subscription.cancelAtPeriodEnd
                  ? t("subscription.cancelDate")
                  : t("subscription.renewalDate")}
                {": "}
                <span className="font-medium text-gray-700">
                  {formatDate(subscription.currentPeriodEnd, i18n.language)}
                </span>
              </p>
            )}
          </div>

          {/* Credits info */}
          {!subscription || subscription.plan === "free" ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
              <p className="mb-1 font-medium text-gray-900">{t("subscription.upgradePrompt")}</p>
              <p className="mb-4 text-sm text-gray-500">{t("subscription.noSubscriptionDesc")}</p>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
              >
                {t("subscription.viewPlans")}
              </Link>
            </div>
          ) : null}

          {/* Cancel subscription */}
          {subscription && subscription.plan !== "free" && subscription.status === "active" && !subscription.cancelAtPeriodEnd && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-800 hover:underline min-h-[44px]"
                >
                  {t("subscription.cancelSubscription")}
                </button>
              ) : (
                <div>
                  <p className="mb-1 font-medium text-gray-900">{t("subscription.cancelConfirmTitle")}</p>
                  <p className="mb-4 text-sm text-gray-600">{t("subscription.cancelConfirmDesc")}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
                    >
                      {t("subscription.cancelConfirm")}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
                    >
                      {t("subscription.cancelAbort")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feedback messages */}
          {cancelFeedback === "success" && (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
              {t("subscription.cancelSuccess")}
            </p>
          )}
          {cancelFeedback === "error" && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {t("subscription.cancelError")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
