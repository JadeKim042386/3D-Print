"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { listModels, type ModelResponse } from "@/lib/api";

function StatusBadge({ status }: { status: ModelResponse["status"] }) {
  const { t } = useTranslation();

  const styles: Record<ModelResponse["status"], string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };

  const labels: Record<ModelResponse["status"], string> = {
    pending: t("dashboard.statusPending"),
    processing: t("dashboard.statusProcessing"),
    ready: t("dashboard.statusReady"),
    error: t("dashboard.statusError"),
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

function ModelCard({ model, lang }: { model: ModelResponse; lang: string }) {
  const { t } = useTranslation();

  return (
    <article
      className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
      aria-label={model.prompt}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium text-gray-900">
          {model.prompt}
        </h3>
        <StatusBadge status={model.status} />
      </div>

      <p className="mb-4 text-xs text-gray-500">
        {t("dashboard.createdAt")}: {formatDate(model.createdAt, lang)}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/models/${model.id}`}
          className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label={`${t("dashboard.viewModel")} - ${model.prompt}`}
        >
          {t("dashboard.viewModel")}
        </Link>
        {model.status === "ready" && model.stlUrl && (
          <a
            href={model.stlUrl}
            download
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            aria-label={`${t("dashboard.downloadStl")} - ${model.prompt}`}
          >
            {t("dashboard.downloadStl")}
          </a>
        )}
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);

  const {
    data: models,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["models"],
    queryFn: () => listModels(accessToken!),
    enabled: !!accessToken,
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
          {t("dashboard.modelsTitle")}
        </h1>
        <Link
          href="/dashboard/orders"
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:underline"
        >
          {t("dashboard.ordersTitle")} &rarr;
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

      {models && models.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="mb-2 text-lg font-medium text-gray-900">
            {t("dashboard.emptyModels")}
          </p>
          <p className="mb-6 text-sm text-gray-500">
            {t("dashboard.emptyModelsDescription")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {t("dashboard.generateFirst")}
          </Link>
        </div>
      )}

      {models && models.length > 0 && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label={t("dashboard.modelsTitle")}
        >
          {models.map((model) => (
            <div key={model.id} role="listitem">
              <ModelCard model={model} lang={i18n.language} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
