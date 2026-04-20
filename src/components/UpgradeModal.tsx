"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-xl">
            🚀
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t("credits.upgradeLater")}
          >
            ✕
          </button>
        </div>

        <h2
          id="upgrade-modal-title"
          className="mb-2 text-lg font-bold text-gray-900"
        >
          {t("credits.exhausted")}
        </h2>
        <p className="mb-6 text-sm text-gray-600">{t("credits.exhaustedDesc")}</p>

        <div className="mb-4 rounded-xl border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{t("pricing.pro")}</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {t("pricing.mostPopular")}
            </span>
          </div>
          <p className="mb-1 text-2xl font-bold text-gray-900">
            {t("pricing.proPriceKrw")}
            <span className="text-sm font-normal text-gray-500">{t("pricing.perMonth")}</span>
          </p>
          <p className="text-xs text-gray-500">{t("pricing.proCredits")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/pricing"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 min-h-[44px]"
          >
            {t("credits.upgrade")}
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 min-h-[44px]"
          >
            {t("credits.upgradeLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
