"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getModel,
  getProviderQuotes,
  createOrder,
  type PaymentMethod,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (
        method: string,
        options: Record<string, unknown>
      ) => Promise<{ paymentKey: string }>;
    };
  }
}

const TOSS_CLIENT_KEY =
  process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_placeholder";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
});

function formatKrw(amount: number): string {
  return krwFormatter.format(amount);
}

export default function OrderPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  const providerId = searchParams.get("provider") ?? "";
  const materialId = searchParams.get("material") ?? "";

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tossLoaded, setTossLoaded] = useState(false);

  // Load Toss Payments SDK
  useEffect(() => {
    if (document.getElementById("toss-payments-sdk")) {
      setTossLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "toss-payments-sdk";
    script.src = "https://js.tosspayments.com/v1/payment";
    script.onload = () => setTossLoaded(true);
    document.head.appendChild(script);
  }, []);

  const { data: model } = useQuery({
    queryKey: ["model", params.id],
    queryFn: () => getModel(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
  });

  const { data: quotesData } = useQuery({
    queryKey: ["quotes", params.id],
    queryFn: () => getProviderQuotes(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
  });

  const provider = quotesData?.providers.find((p) => p.id === providerId);
  const material = provider?.materials.find((m) => m.id === materialId);

  const handlePayment = useCallback(async () => {
    if (!accessToken || !provider || !material) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const order = await createOrder(
        {
          modelId: params.id,
          providerId,
          materialId,
          paymentMethod,
        },
        accessToken
      );

      if (paymentMethod === "card" && tossLoaded && window.TossPayments) {
        const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
        await tossPayments.requestPayment("카드", {
          amount: material.priceKrw,
          orderId: order.id,
          orderName: `3D Print — ${model?.prompt?.slice(0, 30) ?? "Model"}`,
          successUrl: `${window.location.origin}/orders/${order.id}?status=success`,
          failUrl: `${window.location.origin}/orders/${order.id}?status=fail`,
        });
      } else if (
        paymentMethod === "kakaopay" &&
        tossLoaded &&
        window.TossPayments
      ) {
        const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
        await tossPayments.requestPayment("카카오페이", {
          amount: material.priceKrw,
          orderId: order.id,
          orderName: `3D Print — ${model?.prompt?.slice(0, 30) ?? "Model"}`,
          successUrl: `${window.location.origin}/orders/${order.id}?status=success`,
          failUrl: `${window.location.origin}/orders/${order.id}?status=fail`,
        });
      } else {
        // Fallback: redirect to order status page directly
        router.push(`/orders/${order.id}`);
      }
    } catch {
      setError(t("order.paymentFailed"));
      setIsSubmitting(false);
    }
  }, [
    accessToken,
    provider,
    material,
    params.id,
    providerId,
    materialId,
    paymentMethod,
    tossLoaded,
    model,
    router,
    t,
  ]);

  if (!accessToken) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-gray-500">{t("auth.login")}</p>
      </div>
    );
  }

  if (!provider || !material) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("order.title")}
      </h1>

      {/* Order Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t("order.summary")}
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.modelName")}</dt>
            <dd className="font-medium text-gray-900 text-right max-w-[60%] truncate">
              {model?.prompt?.slice(0, 40) ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.provider")}</dt>
            <dd className="font-medium text-gray-900">{provider.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.material")}</dt>
            <dd className="font-medium text-gray-900">{material.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.delivery")}</dt>
            <dd className="font-medium text-gray-900">
              {provider.estimatedDays}
              {t("print.businessDays")}
            </dd>
          </div>
          <hr className="border-gray-100" />
          <div className="flex justify-between text-base">
            <dt className="font-bold text-gray-900">{t("order.total")}</dt>
            <dd className="font-bold text-gray-900">
              {formatKrw(material.priceKrw)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Payment Method */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t("order.paymentMethod")}
        </h2>
        <div className="flex flex-col gap-3">
          <label
            className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              paymentMethod === "card"
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === "card"}
              onChange={() => setPaymentMethod("card")}
              className="accent-gray-900"
            />
            <div>
              <p className="font-medium text-gray-900">
                {t("order.creditCard")}
              </p>
              <p className="text-sm text-gray-500">{t("order.tossPayments")}</p>
            </div>
          </label>

          <label
            className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              paymentMethod === "kakaopay"
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="kakaopay"
              checked={paymentMethod === "kakaopay"}
              onChange={() => setPaymentMethod("kakaopay")}
              className="accent-gray-900"
            />
            <div>
              <p className="font-medium text-gray-900">
                {t("order.kakaoPay")}
              </p>
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6 text-center">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={isSubmitting}
        className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? t("order.processing")
          : `${t("order.pay")} ${formatKrw(material.priceKrw)}`}
      </button>
    </div>
  );
}
