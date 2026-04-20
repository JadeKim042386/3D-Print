"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getModel, updateModelVisibility } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import ShareButton from "@/components/ShareButton";

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

function VisibilityToggle({ modelId, isPublic }: { modelId: string; isPublic: boolean }) {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (newVisibility: boolean) =>
      updateModelVisibility(modelId, newVisibility, accessToken!),
    onSuccess: (data) => {
      queryClient.setQueryData(["model", modelId], data);
      setToast(
        data.isPublic ? t("visibility.madePublic") : t("visibility.madePrivate")
      );
      setTimeout(() => setToast(null), 2500);
    },
  });

  return (
    <div className="flex items-center gap-3">
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => mutation.mutate(e.target.checked)}
          disabled={mutation.isPending}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900" />
      </label>
      <span className="text-sm text-gray-600">
        {isPublic ? t("visibility.public") : t("visibility.private")}
      </span>
      {toast && (
        <span className="text-xs text-green-600 animate-pulse">{toast}</span>
      )}
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

  if (error) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-red-600 font-medium mb-4">{t("viewer.error")}</p>
        <Link
          href="/"
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          {t("error.goHome")}
        </Link>
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
          {/* Reference image alongside 3D model */}
          {model.sourceImageUrl && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500 mb-2">{t("imageUpload.referenceLabel")}</p>
              <img
                src={model.sourceImageUrl}
                alt={t("imageUpload.referenceLabel")}
                className="w-full max-h-[200px] object-contain rounded-lg"
              />
            </div>
          )}
          <ModelViewer stlUrl={model.stlUrl} />

          {/* Mesh quality info */}
          {model.meshQuality && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">{t("meshQuality.title")}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {model.meshQuality.triangleCount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">{t("meshQuality.triangles")}</p>
                </div>
                {model.meshQuality.printabilityScore != null && (
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {model.meshQuality.printabilityScore}/100
                    </p>
                    <p className="text-xs text-gray-500">{t("meshQuality.printability")}</p>
                  </div>
                )}
                {model.meshQuality.volume_mm3 != null && (
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {model.meshQuality.volume_mm3.toLocaleString()} mm<sup>3</sup>
                    </p>
                    <p className="text-xs text-gray-500">{t("meshQuality.volume")}</p>
                  </div>
                )}
                {model.meshQuality.surfaceArea_mm2 != null && (
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {model.meshQuality.surfaceArea_mm2.toLocaleString()} mm<sup>2</sup>
                    </p>
                    <p className="text-xs text-gray-500">{t("meshQuality.surfaceArea")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <VisibilityToggle
              modelId={params.id}
              isPublic={model.isPublic ?? false}
            />
            {model.isPublic && (
              <ShareButton modelId={params.id} modelPrompt={model.prompt} />
            )}
          </div>

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
