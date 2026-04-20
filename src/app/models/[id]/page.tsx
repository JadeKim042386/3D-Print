"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getModel } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import ModelViewer from "@/components/ModelViewer";

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
        <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-4">
          <div className="h-8 w-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          <p className="text-gray-500">{t("viewer.processing")}</p>
        </div>
      ) : model.status === "ready" && model.stlUrl ? (
        <div className="flex flex-col gap-4">
          <ModelViewer stlUrl={model.stlUrl} />

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={model.stlUrl}
              download
              className="flex-1 text-center bg-gray-900 text-white py-3 px-6 rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              {t("viewer.download")}
            </a>
            <Link
              href={`/models/${params.id}/print`}
              className="flex-1 text-center bg-white text-gray-900 py-3 px-6 rounded-xl font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
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
