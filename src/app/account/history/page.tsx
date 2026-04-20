"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { listGenerationHistory, type GenerationHistoryEntry } from "@/lib/api";

function formatDate(dateString: string, lang: string): string {
  const date = new Date(dateString);
  if (lang === "ko") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: GenerationHistoryEntry["status"] }) {
  const { t } = useTranslation();
  const styles: Record<GenerationHistoryEntry["status"], string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };
  const labels: Record<GenerationHistoryEntry["status"], string> = {
    pending: t("dashboard.statusPending"),
    processing: t("dashboard.statusProcessing"),
    ready: t("dashboard.statusReady"),
    error: t("dashboard.statusError"),
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["generation-history", page, accessToken],
    queryFn: () => listGenerationHistory(accessToken!, page),
    enabled: !!accessToken,
  });

  if (!accessToken) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">{t("history.loginRequired")}</h1>
        <p className="mb-6 text-gray-600">{t("history.loginDescription")}</p>
        <Link
          href="/auth"
          className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
        >
          {t("history.goToLogin")}
        </Link>
      </main>
    );
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("history.title")}</h1>
          {data && (
            <p className="mt-1 text-sm text-gray-500">
              {t("history.totalGenerations", { count: data.total })}
            </p>
          )}
        </div>
        <Link
          href="/"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px] flex items-center"
        >
          {t("history.generate")}
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      )}

      {error && (
        <p className="py-8 text-center text-sm text-red-600" role="alert">
          {t("error.pageDescription")}
        </p>
      )}

      {data && data.generations.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="mb-2 text-lg font-medium text-gray-900">{t("history.empty")}</p>
          <p className="mb-6 text-sm text-gray-500">{t("history.emptyDesc")}</p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
          >
            {t("history.generate")}
          </Link>
        </div>
      )}

      {data && data.generations.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("history.prompt")}
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("history.status")}
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("history.creditsUsed")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("history.createdAt")}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.generations.map((gen) => (
                  <tr key={gen.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <p className="line-clamp-1 text-sm text-gray-900 max-w-xs">
                        {gen.prompt ?? "—"}
                      </p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-4">
                      <StatusBadge status={gen.status} />
                    </td>
                    <td className="hidden sm:table-cell px-4 py-4 text-sm text-gray-700">
                      {gen.creditsUsed}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(gen.createdAt, i18n.language)}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/models/${gen.id}`}
                        className="text-sm font-medium text-gray-900 hover:underline min-h-[44px] flex items-center"
                      >
                        {t("history.viewModel")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
              >
                {t("admin.prev")}
              </button>
              <span className="text-sm text-gray-600">
                {t("admin.page")} {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
              >
                {t("admin.next")}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
