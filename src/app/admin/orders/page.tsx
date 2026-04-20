"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import {
  listAdminOrders,
  listAdminPrintOrders,
  updateAdminOrderStatus,
  updateAdminPrintOrderStatus,
  type AdminOrder,
  type AdminPrintOrder,
} from "@/lib/admin-api";

const ORDER_STATUSES = [
  "pending", "confirmed", "printing", "shipped", "delivered", "cancelled", "refunded",
] as const;

const PRINT_ORDER_STATUSES = [
  "quote_requested", "quoted", "order_placed", "printing", "shipped", "delivered", "failed",
] as const;

const PAGE_SIZE = 20;

function formatKrw(amount: number | null): string {
  if (amount == null) return "—";
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatDate(dateString: string, lang: string): string {
  const date = new Date(dateString);
  if (lang === "ko") {
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colorMap: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    printing: "bg-purple-100 text-purple-800",
    shipped: "bg-indigo-100 text-indigo-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    refunded: "bg-orange-100 text-orange-800",
    quote_requested: "bg-gray-100 text-gray-800",
    quoted: "bg-yellow-100 text-yellow-800",
    order_placed: "bg-blue-100 text-blue-800",
    failed: "bg-red-100 text-red-800",
  };

  const labelMap: Record<string, string> = {
    pending: t("admin.statusPending"),
    confirmed: t("admin.statusConfirmed"),
    printing: t("admin.statusPrinting"),
    shipped: t("admin.statusShipped"),
    delivered: t("admin.statusDelivered"),
    cancelled: t("admin.statusCancelled"),
    refunded: t("admin.statusRefunded"),
    quote_requested: t("admin.statusQuoteRequested"),
    quoted: t("admin.statusQuoted"),
    order_placed: t("admin.statusOrderPlaced"),
    failed: t("admin.statusFailed"),
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status] ?? "bg-gray-100 text-gray-800"}`}>
      {labelMap[status] ?? status}
    </span>
  );
}

function OrdersTable({
  orders,
  lang,
  onUpdateStatus,
}: {
  orders: AdminOrder[];
  lang: string;
  onUpdateStatus: (orderId: string, status: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.orderId")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.customer")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.status")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.price")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.date")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                {order.id.slice(0, 8)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {order.users?.email ?? order.customer_email ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={order.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                {formatKrw(order.total_price_krw)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(order.created_at, lang)}
              </td>
              <td className="px-4 py-3">
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  value={order.status}
                  onChange={(e) => onUpdateStatus(order.id, e.target.value)}
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintOrdersTable({
  orders,
  lang,
  onUpdateStatus,
}: {
  orders: AdminPrintOrder[];
  lang: string;
  onUpdateStatus: (printOrderId: string, status: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.orderId")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.customer")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.provider")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.status")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.price")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.date")}</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("admin.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                {order.id.slice(0, 8)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {order.users?.email ?? order.customer_email ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {order.provider_name}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={order.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                {formatKrw(order.price_krw)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(order.created_at, lang)}
              </td>
              <td className="px-4 py-3">
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  value={order.status}
                  onChange={(e) => onUpdateStatus(order.id, e.target.value)}
                >
                  {PRINT_ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"payment" | "print">("payment");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);

  const ordersQuery = useQuery({
    queryKey: ["admin-orders", statusFilter, page],
    queryFn: () =>
      listAdminOrders(accessToken!, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter || undefined,
      }),
    enabled: !!accessToken && tab === "payment",
  });

  const printOrdersQuery = useQuery({
    queryKey: ["admin-print-orders", statusFilter, page],
    queryFn: () =>
      listAdminPrintOrders(accessToken!, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter || undefined,
      }),
    enabled: !!accessToken && tab === "print",
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      updateAdminOrderStatus(accessToken!, orderId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
  });

  const updatePrintOrderMutation = useMutation({
    mutationFn: ({ printOrderId, status }: { printOrderId: string; status: string }) =>
      updateAdminPrintOrderStatus(accessToken!, printOrderId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-print-orders"] }),
  });

  const handleTabChange = (newTab: "payment" | "print") => {
    setTab(newTab);
    setPage(0);
    setStatusFilter("");
  };

  const currentData = tab === "payment" ? ordersQuery.data : printOrdersQuery.data;
  const isLoading = tab === "payment" ? ordersQuery.isLoading : printOrdersQuery.isLoading;
  const totalPages = currentData ? Math.ceil(currentData.total / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Tab selector */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex rounded-lg border border-gray-200">
          <button
            onClick={() => handleTabChange("payment")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "payment" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            } rounded-l-lg`}
          >
            {t("admin.orders")}
          </button>
          <button
            onClick={() => handleTabChange("print")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "print" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            } rounded-r-lg`}
          >
            {t("admin.printOrders")}
          </button>
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t("admin.allStatuses")}</option>
          {(tab === "payment" ? ORDER_STATUSES : PRINT_ORDER_STATUSES).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      )}

      {!isLoading && currentData && currentData.orders.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">{t("admin.noOrders")}</p>
      )}

      {!isLoading && currentData && currentData.orders.length > 0 && (
        <div className="rounded-lg border border-gray-200">
          {tab === "payment" ? (
            <OrdersTable
              orders={currentData.orders as AdminOrder[]}
              lang={i18n.language}
              onUpdateStatus={(orderId, status) => updateOrderMutation.mutate({ orderId, status })}
            />
          ) : (
            <PrintOrdersTable
              orders={currentData.orders as AdminPrintOrder[]}
              lang={i18n.language}
              onUpdateStatus={(printOrderId, status) => updatePrintOrderMutation.mutate({ printOrderId, status })}
            />
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.prev")}
          </button>
          <span className="text-sm text-gray-600">
            {t("admin.page")} {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.next")}
          </button>
        </div>
      )}
    </div>
  );
}
