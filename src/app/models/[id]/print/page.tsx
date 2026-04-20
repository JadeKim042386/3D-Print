"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getProviderQuotes, getModel, type PrintQuote } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type SortMode = "price" | "speed";
type MaterialOption = "PLA" | "ABS" | "PETG" | "Resin" | "Nylon" | "TPU" | "Metal";

const MATERIALS: MaterialOption[] = ["PLA", "ABS", "PETG", "Resin", "Nylon", "TPU", "Metal"];

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
});

function QuoteCard({
  quote,
  onSelect,
}: {
  quote: PrintQuote;
  onSelect: (providerName: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 flex flex-col gap-4 hover:border-gray-400 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {quote.providerDisplayName}
          </h3>
          <span className="text-sm text-gray-500">
            {quote.quoteMethod === "email"
              ? t("print.quoteViaEmail")
              : t("print.quoteViaApi")}
          </span>
        </div>
        <span className="text-xl font-bold text-gray-900">
          {krwFormatter.format(quote.priceKrw)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-gray-500">{t("print.delivery")}</span>
          <p className="font-medium text-gray-900">
            {quote.estimatedDays}
            {t("print.businessDays")}
          </p>
        </div>
        <div>
          <span className="text-gray-500">{t("print.material")}</span>
          <p className="font-medium text-gray-900">{quote.material}</p>
        </div>
        <div>
          <span className="text-gray-500">{t("print.quoteType")}</span>
          <p className="font-medium text-gray-900">
            {quote.quoteMethod === "api" ? "API" : "Email"}
          </p>
        </div>
      </div>

      {quote.notes && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          {quote.notes}
        </p>
      )}

      <button
        onClick={() => onSelect(quote.providerName)}
        className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
      >
        {t("print.selectProvider")}
      </button>
    </div>
  );
}

export default function PrintQuotesPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [material, setMaterial] = useState<MaterialOption>("PLA");
  const [quantity, setQuantity] = useState(1);

  const { data: model } = useQuery({
    queryKey: ["model", params.id],
    queryFn: () => getModel(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
  });

  const {
    data: quotesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["quotes", params.id, material, quantity],
    queryFn: () => getProviderQuotes(params.id, accessToken!, material, quantity),
    enabled: !!accessToken && !!params.id && model?.status === "ready",
  });

  const handleSelectProvider = (providerName: string) => {
    const quote = quotesData?.quotes.find((q) => q.providerName === providerName);
    if (!quote) return;
    const queryParams = new URLSearchParams({
      provider: providerName,
      material,
      quantity: String(quantity),
      price: String(quote.priceKrw),
    });
    router.push(`/models/${params.id}/print/order?${queryParams}`);
  };

  if (!accessToken) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {t("dashboard.loginRequired")}
        </h1>
        <p className="mb-6 text-gray-600">{t("dashboard.loginDescription")}</p>
        <Link
          href="/auth"
          className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
        >
          {t("dashboard.goToLogin")}
        </Link>
      </div>
    );
  }

  const quotes = quotesData?.quotes ?? [];
  const sorted = [...quotes].sort((a, b) => {
    if (sortMode === "price") return a.priceKrw - b.priceKrw;
    return a.estimatedDays - b.estimatedDays;
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("print.title")}</h1>
        <p className="text-gray-500 mt-1">{t("print.subtitle")}</p>
      </div>

      {/* Material & Quantity Selection */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-xl border border-gray-200 bg-gray-50">
        <div className="flex-1 min-w-[140px]">
          <label className="text-sm text-gray-500 block mb-1">
            {t("print.material")}
          </label>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value as MaterialOption)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
          >
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="text-sm text-gray-500 block mb-1">
            {t("print.quantity")}
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="h-8 w-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          <p className="text-gray-500">{t("print.loadingProviders")}</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-500">{t("viewer.error")}</p>
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-gray-500">{t("print.noProviders")}</p>
        </div>
      ) : (
        <>
          {/* Sort Controls */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSortMode("price")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                sortMode === "price"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("print.sortByPrice")}
            </button>
            <button
              onClick={() => setSortMode("speed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                sortMode === "speed"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("print.sortBySpeed")}
            </button>
          </div>

          {/* Provider count */}
          <p className="text-sm text-gray-500 mb-4">
            {quotes.length}{t("print.providersFound")}
          </p>

          {/* Quote Cards */}
          <div className="flex flex-col gap-4">
            {sorted.map((quote) => (
              <QuoteCard
                key={quote.providerName}
                quote={quote}
                onSelect={handleSelectProvider}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
