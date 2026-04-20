"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { getOrder, confirmPayment, type OrderStatus } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

const STATUS_STEPS: OrderStatus[] = [
  "pending",
  "paid",
  "printing",
  "shipped",
  "delivered",
];

function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();

  const statusMap: Record<OrderStatus, { label: string; color: string }> = {
    pending: {
      label: t("order.statusPending"),
      color: "bg-yellow-100 text-yellow-800",
    },
    paid: {
      label: t("order.statusPaid"),
      color: "bg-blue-100 text-blue-800",
    },
    printing: {
      label: t("order.statusPrinting"),
      color: "bg-purple-100 text-purple-800",
    },
    shipped: {
      label: t("order.statusShipped"),
      color: "bg-indigo-100 text-indigo-800",
    },
    delivered: {
      label: t("order.statusDelivered"),
      color: "bg-green-100 text-green-800",
    },
    failed: {
      label: t("order.statusFailed"),
      color: "bg-red-100 text-red-800",
    },
  };

  const info = statusMap[status];
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${info.color}`}
    >
      {info.label}
    </span>
  );
}

function StatusTracker({ currentStatus }: { currentStatus: OrderStatus }) {
  const { t } = useTranslation();
  if (currentStatus === "failed") return null;

  const currentIdx = STATUS_STEPS.indexOf(currentStatus);

  const labelMap: Record<string, string> = {
    pending: t("order.statusPending"),
    paid: t("order.statusPaid"),
    printing: t("order.statusPrinting"),
    shipped: t("order.statusShipped"),
    delivered: t("order.statusDelivered"),
  };

  return (
    <div className="flex items-center justify-between w-full overflow-x-auto">
      {STATUS_STEPS.map((step, idx) => {
        const isCompleted = idx <= currentIdx;
        const isActive = idx === currentIdx;
        return (
          <div key={step} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                isActive
                  ? "bg-gray-900 text-white"
                  : isCompleted
                    ? "bg-gray-900 text-white"
                    : "bg-gray-200 text-gray-400"
              }`}
            >
              {isCompleted && idx < currentIdx ? "✓" : idx + 1}
            </div>
            <span
              className={`text-xs mt-1 text-center ${
                isActive ? "font-bold text-gray-900" : "text-gray-400"
              }`}
            >
              {labelMap[step]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderStatusPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);

  const paymentStatus = searchParams.get("status");
  const paymentKey = searchParams.get("paymentKey");

  const {
    data: order,
    error,
    refetch,
  } = useQuery({
    queryKey: ["order", params.id],
    queryFn: () => getOrder(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "delivered" || status === "failed") return false;
      return 5000;
    },
  });

  // Confirm payment when redirected from Toss
  useEffect(() => {
    if (
      paymentStatus === "success" &&
      paymentKey &&
      accessToken &&
      order?.status === "pending"
    ) {
      confirmPayment(params.id, paymentKey, accessToken).then(() => refetch());
    }
  }, [paymentStatus, paymentKey, accessToken, order?.status, params.id, refetch]);

  if (!accessToken) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-gray-500">{t("auth.login")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-red-500">{t("viewer.error")}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const isFailed = order.status === "failed";
  const isSuccess = paymentStatus === "success" || order.status !== "pending";

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      {isSuccess && !isFailed ? (
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("order.confirmTitle")}
          </h1>
          <p className="text-gray-500 mt-1">{t("order.confirmDescription")}</p>
        </div>
      ) : isFailed ? (
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-500">!</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("order.statusFailed")}
          </h1>
          <p className="text-red-500 mt-1">{t("order.paymentFailed")}</p>
        </div>
      ) : (
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t("order.title")}
        </h1>
      )}

      {/* Status Tracker */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">{t("order.status")}</h2>
          <StatusBadge status={order.status} />
        </div>
        <StatusTracker currentStatus={order.status} />
      </div>

      {/* Order Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t("order.summary")}
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.orderId")}</dt>
            <dd className="font-mono text-gray-900 text-sm">
              {order.id.slice(0, 8).toUpperCase()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.provider")}</dt>
            <dd className="font-medium text-gray-900">{order.providerName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.material")}</dt>
            <dd className="font-medium text-gray-900">{order.materialName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.delivery")}</dt>
            <dd className="font-medium text-gray-900">
              {order.estimatedDays}
              {t("print.businessDays")}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t("order.paymentMethod")}</dt>
            <dd className="font-medium text-gray-900">
              {order.paymentMethod === "kakaopay"
                ? t("order.kakaoPay")
                : t("order.creditCard")}
            </dd>
          </div>
          <hr className="border-gray-100" />
          <div className="flex justify-between text-base">
            <dt className="font-bold text-gray-900">{t("order.total")}</dt>
            <dd className="font-bold text-gray-900">
              {formatKrw(order.priceKrw)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Link
          href={`/models/${order.modelId}`}
          className="w-full text-center bg-gray-100 text-gray-900 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
        >
          {t("order.backToModel")}
        </Link>
      </div>
    </div>
  );
}
