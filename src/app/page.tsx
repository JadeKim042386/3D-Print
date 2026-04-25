"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import PromptForm from "@/components/PromptForm";
import ImageUploadForm from "@/components/ImageUploadForm";
import { getGalleryModels, getPrintProviders } from "@/lib/api";

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function StepItem({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white text-sm font-bold">
        {number}
      </div>
      <h4 className="mb-1 font-semibold text-gray-900">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function RecentModelsFeed() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["gallery-landing"],
    queryFn: () => getGalleryModels(1, 6),
    staleTime: 60_000,
  });

  const models = data?.models ?? [];

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-none w-36 sm:w-44 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden animate-pulse"
          >
            <div className="aspect-square bg-gray-200" />
            <div className="p-3 space-y-1">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (models.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      {models.map((model) => (
        <Link
          key={model.id}
          href={`/models/${model.id}/public`}
          className="flex-none w-36 sm:w-44 group rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <svg
              width="36"
              height="36"
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
          </div>
          <div className="p-3">
            <p className="text-xs font-medium text-gray-700 truncate leading-snug">
              {model.prompt}
            </p>
          </div>
        </Link>
      ))}
      <Link
        href="/gallery"
        className="flex-none w-36 sm:w-44 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-2 p-4 hover:bg-gray-100 transition-colors text-center"
      >
        <span className="text-xs font-medium text-gray-500">
          {t("landing.viewAllModels")}
        </span>
        <span className="text-gray-400">→</span>
      </Link>
    </div>
  );
}

function SocialProof() {
  const { t } = useTranslation();

  const { data: gallery } = useQuery({
    queryKey: ["gallery-stats"],
    queryFn: () => getGalleryModels(1, 1),
    staleTime: 300_000,
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-count"],
    queryFn: getPrintProviders,
    staleTime: 300_000,
  });

  const generationCount = gallery?.total ?? 0;
  const providerCount = providers?.providers?.length ?? 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
      <div className="text-center">
        <p className="text-3xl sm:text-4xl font-bold text-gray-900">
          {generationCount > 0
            ? `${generationCount.toLocaleString("ko-KR")}+`
            : "—"}
        </p>
        <p className="mt-1 text-sm text-gray-500">{t("landing.statModels")}</p>
      </div>
      <div className="hidden sm:block h-10 w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-3xl sm:text-4xl font-bold text-gray-900">
          {providerCount > 0 ? `${providerCount}+` : "—"}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {t("landing.statProviders")}
        </p>
      </div>
      <div className="hidden sm:block h-10 w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-3xl sm:text-4xl font-bold text-gray-900">100%</p>
        <p className="mt-1 text-sm text-gray-500">{t("landing.statAI")}</p>
      </div>
    </div>
  );
}

const PRICING_ROWS: Array<{
  labelKey: string;
  free: string;
  pro: string;
  business: string;
}> = [
  {
    labelKey: "landing.pricingCredits",
    free: "10",
    pro: "100",
    business: "500",
  },
  {
    labelKey: "landing.pricingPriority",
    free: "—",
    pro: "✓",
    business: "✓",
  },
  {
    labelKey: "landing.pricingWatermark",
    free: "—",
    pro: "✓",
    business: "✓",
  },
  {
    labelKey: "landing.pricingAPI",
    free: "—",
    pro: "—",
    business: "✓",
  },
];

function PricingSnapshot() {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-3 pr-4 text-gray-500 font-medium w-1/2" />
            <th className="px-4 py-3 text-center font-semibold text-gray-700">
              {t("pricing.free")}
              <div className="text-xs font-normal text-gray-400">₩0</div>
            </th>
            <th className="px-4 py-3 text-center font-semibold text-gray-900 bg-gray-50 rounded-t-lg">
              {t("pricing.pro")}
              <div className="text-xs font-normal text-gray-500">₩19,900/월</div>
            </th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700">
              {t("pricing.business")}
              <div className="text-xs font-normal text-gray-400">₩49,900/월</div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {PRICING_ROWS.map((row) => (
            <tr key={row.labelKey}>
              <td className="py-3 pr-4 text-gray-600">{t(row.labelKey)}</td>
              <td className="px-4 py-3 text-center text-gray-600">
                {row.free}
              </td>
              <td className="px-4 py-3 text-center font-medium text-gray-900 bg-gray-50">
                {row.pro}
              </td>
              <td className="px-4 py-3 text-center text-gray-600">
                {row.business}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
        >
          {t("landing.viewFullPricing")} →
        </Link>
      </div>
    </div>
  );
}

function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-57px)]">
      {/* Hero */}
      <section className="px-4 py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 inline-block rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600 tracking-wide">
            {t("landing.badge")}
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            {t("landing.hero")}
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
            {t("landing.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px] w-full sm:w-auto justify-center"
            >
              {t("landing.cta")}
            </Link>
            <Link
              href="/gallery"
              className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-8 py-4 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px] w-full sm:w-auto justify-center"
            >
              {t("landing.viewGallery")}
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof stats */}
      <section className="border-y border-gray-100 bg-white px-4 py-10">
        <SocialProof />
      </section>

      {/* Recent models feed */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {t("landing.recentModelsTitle")}
            </h2>
            <Link
              href="/gallery"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {t("landing.viewAll")} →
            </Link>
          </div>
          <RecentModelsFeed />
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            {t("landing.featuresTitle")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
              }
              title={t("landing.feature1Title")}
              description={t("landing.feature1Desc")}
            />
            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                  />
                </svg>
              }
              title={t("landing.feature2Title")}
              description={t("landing.feature2Desc")}
            />
            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
                  />
                </svg>
              }
              title={t("landing.feature3Title")}
              description={t("landing.feature3Desc")}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
            {t("landing.howItWorksTitle")}
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <StepItem
              number={1}
              title={t("landing.step1")}
              description={t("landing.step1Desc")}
            />
            <StepItem
              number={2}
              title={t("landing.step2")}
              description={t("landing.step2Desc")}
            />
            <StepItem
              number={3}
              title={t("landing.step3")}
              description={t("landing.step3Desc")}
            />
          </div>
        </div>
      </section>

      {/* Pricing snapshot */}
      <section className="bg-gray-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-2 text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            {t("landing.pricingTitle")}
          </h2>
          <p className="mb-8 text-center text-gray-500 text-sm">
            {t("landing.pricingSubtitle")}
          </p>
          <PricingSnapshot />
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            {t("landing.finalCtaTitle")}
          </h2>
          <p className="text-gray-600 mb-8">{t("landing.finalCtaSubtitle")}</p>
          <Link
            href="/auth"
            className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px]"
          >
            {t("landing.cta")}
          </Link>
        </div>
      </section>
    </div>
  );
}

type GenerationMode = "text" | "image";

function AuthenticatedHome() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GenerationMode>("text");

  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          {t("prompt.title")}
        </h1>
        <p className="text-gray-600 text-lg">{t("app.description")}</p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-6 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "text"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("modeToggle.text")}
        </button>
        <button
          type="button"
          onClick={() => setMode("image")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "image"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("modeToggle.image")}
        </button>
      </div>

      {mode === "text" ? <PromptForm /> : <ImageUploadForm />}
    </div>
  );
}

export default function HomePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return accessToken ? <AuthenticatedHome /> : <LandingPage />;
}
