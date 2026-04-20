"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useState } from "react";
import { getGalleryModels } from "@/lib/api";

export default function GalleryPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data, isLoading } = useQuery({
    queryKey: ["gallery", page],
    queryFn: () => getGalleryModels(page, pageSize),
  });

  const models = data?.models ?? [];
  const hasMore = data ? page * pageSize < data.total : false;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t("gallery.title")}
        </h1>
        <p className="text-gray-600">{t("gallery.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg
              width="32"
              height="32"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">
            {t("gallery.empty")}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {t("gallery.emptyDescription")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px]"
          >
            {t("landing.cta")}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {models.map((model) => (
              <Link
                key={model.id}
                href={`/models/${model.id}/public`}
                className="group rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
                  <svg
                    width="48"
                    height="48"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1}
                    stroke="currentColor"
                    className="text-gray-400 group-hover:text-gray-600 transition-colors"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <path d="M3.27 6.96 12 12.01l8.73-5.05" />
                    <path d="M12 22.08V12" />
                  </svg>
                  <span className="absolute bottom-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded-md">
                    {t("gallery.madeWith")}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-medium text-gray-900 truncate mb-1">
                    {model.prompt}
                  </p>
                  {model.ownerName && (
                    <p className="text-xs text-gray-500">
                      {model.ownerName}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(model.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 min-h-[44px]"
              >
                {t("gallery.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
