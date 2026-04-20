"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getPublicModel } from "@/lib/api";
import ShareButton from "@/components/ShareButton";

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  ),
});

export default function PublicModelClient({ modelId }: { modelId: string }) {
  const { t } = useTranslation();

  const { data: model, error } = useQuery({
    queryKey: ["publicModel", modelId],
    queryFn: () => getPublicModel(modelId),
  });

  if (error) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-red-600 font-medium mb-4">{t("viewer.error")}</p>
        <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 underline">
          {t("error.goHome")}
        </Link>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {model.prompt}
        </h1>
        {model.ownerName && (
          <p className="text-sm text-gray-500">
            {t("gallery.createdBy")}: {model.ownerName}
          </p>
        )}
      </div>

      <ModelViewer stlUrl={model.stlUrl} />

      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <a
          href={model.stlUrl}
          download
          className="flex-1 text-center bg-gray-900 text-white py-3 px-6 rounded-xl font-medium hover:bg-gray-800 transition-colors min-h-[44px] flex items-center justify-center"
        >
          {t("viewer.download")}
        </a>
        <ShareButton modelId={modelId} modelPrompt={model.prompt} />
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-500 mb-3">{t("gallery.madeWith")}</p>
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-gray-900 hover:text-gray-700"
        >
          {t("landing.cta")} &rarr;
        </Link>
      </div>
    </div>
  );
}
