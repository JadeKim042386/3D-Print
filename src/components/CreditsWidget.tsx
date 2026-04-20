"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getCreditsBalance } from "@/lib/api";

interface CreditsWidgetProps {
  accessToken: string;
}

export default function CreditsWidget({ accessToken }: CreditsWidgetProps) {
  const { t } = useTranslation();

  const { data: credits } = useQuery({
    queryKey: ["credits-balance", accessToken],
    queryFn: () => getCreditsBalance(accessToken),
    staleTime: 30_000,
    retry: false,
  });

  if (!credits) return null;

  const isLow = credits.remaining <= 3 && credits.remaining > 0;
  const isExhausted = credits.remaining === 0;

  if (isExhausted) {
    return (
      <Link
        href="/pricing"
        className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 min-h-[44px] transition-colors"
        title={t("credits.exhaustedDesc")}
      >
        <span className="text-red-500">⚠</span>
        <span>{t("credits.upgrade")}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/account/subscription"
      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium min-h-[44px] transition-colors ${
        isLow
          ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
      title={isLow ? t("credits.lowWarningDesc", { count: credits.remaining }) : undefined}
    >
      {isLow && <span className="text-orange-500">⚠</span>}
      <span>
        {credits.remaining}
        <span className="text-gray-400 ml-0.5">/{credits.total}</span>
      </span>
      <span className="hidden sm:inline text-gray-500 ml-0.5">{t("credits.balance")}</span>
    </Link>
  );
}
