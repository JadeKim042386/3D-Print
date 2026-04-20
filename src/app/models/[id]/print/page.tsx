"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getProviderQuotes, getModel, type PrintProvider } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type SortMode = "price" | "speed";

function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function ProviderCard({
  provider,
  onSelect,
}: {
  provider: PrintProvider;
  onSelect: (providerId: string, materialId: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedMaterial, setSelectedMaterial] = useState(
    provider.materials[0]?.id ?? ""
  );

  const currentMaterial = provider.materials.find(
    (m) => m.id === selectedMaterial
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{provider.name}</h3>
          {!provider.available && (
            <span className="text-sm text-red-500">
              {t("print.providerUnavailable")}
            </span>
          )}
        </div>
        {currentMaterial && (
          <span className="text-xl font-bold text-gray-900">
            {formatKrw(currentMaterial.priceKrw)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">{t("print.delivery")}</span>
          <p className="font-medium text-gray-900">
            {provider.estimatedDays}
            {t("print.businessDays")}
          </p>
        </div>
        <div>
          <span className="text-gray-500">{t("print.material")}</span>
          {provider.materials.length > 1 ? (
            <select
              value={selectedMaterial}
              onChange={(e) => setSelectedMaterial(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900"
            >
              {provider.materials.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name} — {formatKrw(mat.priceKrw)}
                </option>
              ))}
            </select>
          ) : (
            <p className="font-medium text-gray-900">
              {currentMaterial?.name}
            </p>
          )}
        </div>
      </div>

      <button
        disabled={!provider.available}
        onClick={() => onSelect(provider.id, selectedMaterial)}
        className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    queryKey: ["quotes", params.id],
    queryFn: () => getProviderQuotes(params.id, accessToken!),
    enabled: !!accessToken && !!params.id && model?.status === "ready",
  });

  const handleSelectProvider = (providerId: string, materialId: string) => {
    router.push(
      `/models/${params.id}/print/order?provider=${providerId}&material=${materialId}`
    );
  };

  if (!accessToken) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-gray-500">{t("auth.login")}</p>
      </div>
    );
  }

  const providers = quotesData?.providers ?? [];
  const sorted = [...providers].sort((a, b) => {
    if (sortMode === "price") {
      const aPrice = Math.min(...a.materials.map((m) => m.priceKrw));
      const bPrice = Math.min(...b.materials.map((m) => m.priceKrw));
      return aPrice - bPrice;
    }
    return a.estimatedDays - b.estimatedDays;
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("print.title")}</h1>
        <p className="text-gray-500 mt-1">{t("print.subtitle")}</p>
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
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-gray-500">{t("print.noProviders")}</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSortMode("price")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortMode === "price"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("print.sortByPrice")}
            </button>
            <button
              onClick={() => setSortMode("speed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortMode === "speed"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("print.sortBySpeed")}
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {sorted.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onSelect={handleSelectProvider}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
