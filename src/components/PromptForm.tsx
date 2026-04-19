"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { generateModel } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export default function PromptForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateModel({ prompt: prompt.trim() }, accessToken);
      router.push(`/models/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("prompt.placeholder")}
          rows={4}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
          disabled={isLoading}
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={isLoading || !prompt.trim() || !accessToken}
          className="w-full bg-gray-900 text-white py-3 px-6 rounded-xl text-base font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? t("prompt.generating") : t("prompt.submit")}
        </button>

        {!accessToken && (
          <p className="text-sm text-gray-500 text-center">
            {t("auth.login")}
          </p>
        )}
      </div>
    </form>
  );
}
