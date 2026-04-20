"use client";

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { getAdminMetrics } from "@/lib/admin-api";

function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => getAdminMetrics(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 60_000,
  });

  if (isLoading || !metrics) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  const cards = [
    { label: t("admin.totalOrders"), value: metrics.totalOrders.toLocaleString() },
    { label: t("admin.totalRevenue"), value: formatKrw(metrics.totalRevenue) },
    { label: t("admin.monthlyRevenue"), value: formatKrw(metrics.monthlyRevenue) },
    { label: t("admin.avgOrderValue"), value: formatKrw(metrics.avgOrderValue) },
    { label: t("admin.totalUsers"), value: metrics.totalUsers.toLocaleString() },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {t("admin.metrics")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-gray-200 bg-white p-5"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
