"use client";

import { useTranslation } from "react-i18next";
import PromptForm from "@/components/PromptForm";

export default function HomePage() {
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
