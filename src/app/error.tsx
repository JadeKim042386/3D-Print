"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg
          width="32"
          height="32"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          className="text-red-600"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t("error.pageTitle")}
      </h1>
      <p className="text-gray-600 mb-8 max-w-md">
        {t("error.pageDescription")}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors min-h-[44px]"
        >
          {t("error.retry")}
        </button>
        <Link
          href="/"
          className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors min-h-[44px] inline-flex items-center justify-center"
        >
          {t("error.goHome")}
        </Link>
      </div>
    </div>
  );
}
