"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { getFunnelAnalytics, type FunnelStage } from "@/lib/admin-api";

const PERIOD_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function FunnelBar({ stage, maxCount }: { stage: FunnelStage; maxCount: number }) {
  const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="w-36 text-sm font-medium text-gray-700 shrink-0">
        {stage.label}
      </div>
      <div className="flex-1 relative">
        <div className="h-10 rounded-lg bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-lg bg-gray-900 transition-all duration-500"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>
      <div className="w-20 text-right text-sm font-bold text-gray-900 tabular-nums">
        {stage.count.toLocaleString()}
      </div>
    </div>
  );
}

function ConversionArrow({ rate }: { rate: number }) {
  const color =
    rate >= 50 ? "text-green-600" : rate >= 20 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex items-center justify-center py-1">
      <span className="text-gray-300 text-lg">&#x2193;</span>
      <span className={`ml-2 text-sm font-bold ${color}`}>{rate}%</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-funnel", days],
    queryFn: () => getFunnelAnalytics(accessToken!, days),
    enabled: !!accessToken,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  const maxCount = Math.max(...data.funnel.map((s) => s.count), 1);

  return (
    <div className="space-y-8">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("admin.analytics", "Conversion Funnel")}
        </h2>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === opt.days
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Users" value={data.totals.users} />
        <StatCard label="Signups" value={data.totals.signups} />
        <StatCard label="Generations" value={data.totals.generations} />
        <StatCard label="Orders" value={data.totals.orders} />
        <StatCard label="Payments" value={data.totals.payments} />
        <StatCard label="Upgrades" value={data.totals.upgrades} />
      </div>

      {/* Funnel visualization */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-6 text-base font-semibold text-gray-900">
          Signup &#x2192; Generate &#x2192; Order &#x2192; Pay &#x2192; Upgrade
        </h3>
        <div className="space-y-1">
          {data.funnel.map((stage, i) => (
            <div key={stage.stage}>
              <FunnelBar stage={stage} maxCount={maxCount} />
              {i < data.conversions.length && (
                <ConversionArrow rate={data.conversions[i]!.rate} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rates table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          Stage-to-Stage Conversion
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left font-medium text-gray-500">From</th>
              <th className="pb-2 text-left font-medium text-gray-500">To</th>
              <th className="pb-2 text-right font-medium text-gray-500">Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.conversions.map((c) => {
              const color =
                c.rate >= 50
                  ? "text-green-600"
                  : c.rate >= 20
                    ? "text-yellow-600"
                    : "text-red-500";
              return (
                <tr key={`${c.from}-${c.to}`} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700 capitalize">
                    {c.from.replace(/_/g, " ")}
                  </td>
                  <td className="py-2 text-gray-700 capitalize">
                    {c.to.replace(/_/g, " ")}
                  </td>
                  <td className={`py-2 text-right font-bold ${color}`}>
                    {c.rate}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Daily stats table */}
      {data.dailyStats.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 overflow-x-auto">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Daily Breakdown
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left font-medium text-gray-500">Date</th>
                <th className="pb-2 text-right font-medium text-gray-500">Signups</th>
                <th className="pb-2 text-right font-medium text-gray-500">Generations</th>
                <th className="pb-2 text-right font-medium text-gray-500">Orders</th>
                <th className="pb-2 text-right font-medium text-gray-500">Payments</th>
                <th className="pb-2 text-right font-medium text-gray-500">DAU</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyStats.map((day) => (
                <tr key={day.date} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{day.date}</td>
                  <td className="py-2 text-right tabular-nums">{day.signups}</td>
                  <td className="py-2 text-right tabular-nums">{day.total_generations}</td>
                  <td className="py-2 text-right tabular-nums">{day.total_orders}</td>
                  <td className="py-2 text-right tabular-nums">{day.payments_completed}</td>
                  <td className="py-2 text-right tabular-nums">{day.dau}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
