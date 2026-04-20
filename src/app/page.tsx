"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/store";
import PromptForm from "@/components/PromptForm";

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

function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-57px)]">
      {/* Hero */}
      <section className="px-4 py-16 sm:py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            {t("landing.hero")}
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
            {t("landing.subtitle")}
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px]"
          >
            {t("landing.cta")}
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-16 sm:pb-24">
        <div className="mx-auto max-w-5xl grid gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            }
            title={t("landing.feature1Title")}
            description={t("landing.feature1Desc")}
          />
          <FeatureCard
            icon={
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            }
            title={t("landing.feature2Title")}
            description={t("landing.feature2Desc")}
          />
          <FeatureCard
            icon={
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            }
            title={t("landing.feature3Title")}
            description={t("landing.feature3Desc")}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
            {t("landing.howItWorksTitle")}
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <StepItem number={1} title={t("landing.step1")} description={t("landing.step1Desc")} />
            <StepItem number={2} title={t("landing.step2")} description={t("landing.step2Desc")} />
            <StepItem number={3} title={t("landing.step3")} description={t("landing.step3Desc")} />
          </div>
          <div className="text-center mt-12">
            <Link
              href="/auth"
              className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px]"
            >
              {t("landing.cta")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthenticatedHome() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          {t("prompt.title")}
        </h1>
        <p className="text-gray-600 text-lg">{t("app.description")}</p>
      </div>

      <PromptForm />
    </div>
  );
}

export default function HomePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return accessToken ? <AuthenticatedHome /> : <LandingPage />;
}
