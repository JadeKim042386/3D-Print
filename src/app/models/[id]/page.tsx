"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getModel } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  ),
});

function GenerationProgress() {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Meshy.ai jobs typically take 30-120s
  const estimatedTotal = 90;
  const progress = Math.min((elapsed / estimatedTotal) * 100, 95);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}${t("viewer.seconds")}`;
  };

  const remaining = Math.max(estimatedTotal - elapsed, 5);

  return (
    <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-5 px-6">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64">
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="4"
          />
          <circle
            cx="32" cy="32" r="28"
            fill="none"
            stroke="#111827"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${progress * 1.76} 176`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-gray-900 font-medium mb-1">
          {t("viewer.processing")}
        </p>
        <p className="text-sm text-gray-500">
          {t("viewer.estimatedTime", { time: formatTime(remaining) })}
        </p>
      </div>

      <div className="w-full max-w-xs">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          {t("viewer.elapsed", { time: formatTime(elapsed) })}
        </p>
      </div>
    </div>
  );
}

export default function ModelPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: model, error } = useQuery({
    queryKey: ["model", params.id],
    queryFn: () => getModel(params.id, accessToken!),
    enabled: !!accessToken && !!params.id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "ready" || status === "error") return false;
      return 3000;
    },
  });

  if (!accessToken) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-gray-500">{t("auth.login")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center">
        <p className="text-red-500">{t("viewer.error")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("viewer.title")}
      </h1>

      {!model || model.status === "pending" || model.status === "processing" ? (
        <GenerationProgress />
      ) : model.status === "ready" && model.stlUrl ? (
        <div className="flex flex-col gap-4">
          <ModelViewer stlUrl={model.stlUrl} />

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={model.stlUrl}
              download
              className="flex-1 text-center bg-gray-900 text-white py-3 px-6 rounded-xl font-medium hover:bg-gray-800 transition-colors min-h-[44px] flex items-center justify-center"
            >
              {t("viewer.download")}
            </a>
            <Link
              href={`/models/${params.id}/print`}
              className="flex-1 text-center bg-white text-gray-900 py-3 px-6 rounded-xl font-medium border border-gray-300 hover:bg-gray-50 transition-colors min-h-[44px] flex items-center justify-center"
            >
              {t("viewer.requestPrint")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="w-full aspect-square max-h-[600px] rounded-xl border border-red-200 bg-red-50 flex items-center justify-center">
          <p className="text-red-500">{t("viewer.error")}</p>
        </div>
      )}
    </div>
  );
}
