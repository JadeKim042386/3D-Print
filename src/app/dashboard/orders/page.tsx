"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { listOrders, type OrderResponse, type OrderStatus } from "@/lib/api";

const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "failed"];
const POLL_INTERVAL_MS = 30_000;

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();

  const styles: Record<OrderStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-blue-100 text-blue-800",
    printing: "bg-purple-100 text-purple-800",
    shipped: "bg-indigo-100 text-indigo-800",
    delivered: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const labels: Record<OrderStatus, string> = {
    pending: t("order.statusPending"),
    paid: t("order.statusPaid"),
    printing: t("order.statusPrinting"),
    shipped: t("order.statusShipped"),
    delivered: t("order.statusDelivered"),
    failed: t("order.statusFailed"),
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
      role="status"
    >
      {labels[status]}
    </span>
  );
}

function formatDate(dateString: string, lang: string): string {
  const date = new Date(dateString);
  if (lang === "ko") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function OrderCard({ order, lang }: { order: OrderResponse; lang: string }) {
  const { t } = useTranslation();

  return (
    <article
      className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
      aria-label={`${t("order.orderId")}: ${order.id.slice(0, 8)}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {order.providerName}
          </p>
          <p className="text-xs text-gray-500">{order.materialName}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mb-4 space-y-1 text-xs text-gray-500">
        <p>
          {t("dashboard.orderDate")}: {formatDate(order.createdAt, lang)}
        </p>
        <p>
          {t("order.price")}: {formatKrw(order.priceKrw)}
        </p>
        <p>
          {t("order.delivery")}: {order.estimatedDays}
          {t("print.businessDays")}
        </p>
      </div>

      <Link
        href={`/orders/${order.id}`}
        className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        aria-label={`${t("dashboard.viewOrder")} - ${order.providerName}`}
      >
        {t("dashboard.viewOrder")}
      </Link>
    </article>
  );
}

export default function DashboardOrdersPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);

  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: () => listOrders(accessToken!),
    enabled: !!accessToken,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActiveOrders = data.some(
        (o) => !TERMINAL_STATUSES.includes(o.status)
      );
      return hasActiveOrders ? POLL_INTERVAL_MS : false;
    },
  });

  if (!accessToken) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {t("dashboard.loginRequired")}
        </h1>
        <p className="mb-6 text-gray-600">{t("dashboard.loginDescription")}</p>
        <Link
          href="/auth"
          className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          {t("dashboard.goToLogin")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("dashboard.ordersTitle")}
        </h1>
        <Link
          href="/dashboard"
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:underline"
        >
          &larr; {t("dashboard.modelsTitle")}
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16" role="status" aria-label={t("viewer.loading")}>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      )}

      {error && (
        <p className="py-8 text-center text-sm text-red-600" role="alert">
          {t("viewer.error")}
        </p>
      )}

      {orders && orders.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="mb-2 text-lg font-medium text-gray-900">
            {t("dashboard.emptyOrders")}
          </p>
          <p className="mb-6 text-sm text-gray-500">
            {t("dashboard.emptyOrdersDescription")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {t("dashboard.generateFirst")}
          </Link>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label={t("dashboard.ordersTitle")}
        >
          {orders.map((order) => (
            <div key={order.id} role="listitem">
              <OrderCard order={order} lang={i18n.language} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
