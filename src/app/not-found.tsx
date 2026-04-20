"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <span className="text-3xl font-bold text-gray-400">404</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t("error.notFoundTitle")}
      </h1>
      <p className="text-gray-600 mb-8 max-w-md">
        {t("error.notFoundDescription")}
      </p>
      <Link
        href="/"
        className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors min-h-[44px] inline-flex items-center"
      >
        {t("error.goHome")}
      </Link>
    </div>
  );
}
