"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getCreditsBalance } from "@/lib/api";

interface CreditBannerProps {
  accessToken: string;
}

export default function CreditBanner({ accessToken }: CreditBannerProps) {
  const { t } = useTranslation();

  const { data: credits } = useQuery({
    queryKey: ["credits-balance", accessToken],
    queryFn: () => getCreditsBalance(accessToken),
    staleTime: 30_000,
    retry: false,
  });

  if (!credits) return null;

  const isLow = credits.remaining > 0 && credits.remaining <= 3;
  const isExhausted = credits.remaining === 0;

  if (!isLow && !isExhausted) return null;

  return (
    <div
      className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        isExhausted
          ? "border-red-200 bg-red-50"
          : "border-orange-200 bg-orange-50"
      }`}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{isExhausted ? "\u26A0\uFE0F" : "\u26A1"}</span>
        <div>
          <p
            className={`text-sm font-semibold ${
              isExhausted ? "text-red-800" : "text-orange-800"
            }`}
          >
            {isExhausted
              ? t("credits.exhausted")
              : t("credits.lowWarning")}
          </p>
          <p
            className={`text-xs ${
              isExhausted ? "text-red-600" : "text-orange-600"
            }`}
          >
            {isExhausted
              ? t("credits.exhaustedDesc")
              : t("credits.lowWarningDesc", { count: credits.remaining })}
          </p>
        </div>
      </div>
      <Link
        href="/pricing"
        className={`inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
          isExhausted
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-orange-600 text-white hover:bg-orange-700"
        }`}
      >
        {t("credits.upgrade")}
      </Link>
    </div>
  );
}
