"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { getCreditsBalance } from "@/lib/api";

function Confetti() {
  const [particles, setParticles] = useState<
    Array<{ id: number; x: number; delay: number; color: string; size: number }>
  >([]);

  useEffect(() => {
    const colors = [
      "#4F46E5", "#7C3AED", "#EC4899", "#F59E0B", "#10B981",
      "#3B82F6", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316",
    ];
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 4,
    }));
    setParticles(items);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: `${p.x}%`,
            top: "-10px",
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall 2.5s ease-in forwards;
        }
      `}</style>
    </div>
  );
}

export default function UpgradeSuccessPage() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(true);

  const { data: credits } = useQuery({
    queryKey: ["credits-balance", accessToken],
    queryFn: () => getCreditsBalance(accessToken!),
    enabled: !!accessToken,
    retry: false,
    refetchInterval: 2_000,
  });

  useEffect(() => {
    // Invalidate stale credit caches
    queryClient.invalidateQueries({ queryKey: ["credits-balance"] });
    queryClient.invalidateQueries({ queryKey: ["subscription"] });

    const timer = setTimeout(() => setShowConfetti(false), 3_000);
    return () => clearTimeout(timer);
  }, [queryClient]);

  return (
    <>
      {showConfetti && <Confetti />}

      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
          &#x1F389;
        </div>

        <h1 className="mb-3 text-2xl font-bold text-gray-900">
          {t("upgradeSuccess.title")}
        </h1>
        <p className="mb-8 text-gray-600">
          {t("upgradeSuccess.description")}
        </p>

        {credits && (
          <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-6">
            <p className="mb-1 text-sm font-medium text-green-800">
              {t("upgradeSuccess.creditsReady")}
            </p>
            <p className="text-4xl font-bold text-green-700">
              {credits.remaining}
            </p>
            <p className="mt-1 text-xs text-green-600">
              {t("credits.creditsPerMonth")}
            </p>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            {t("upgradeSuccess.tip")}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 min-h-[44px] transition-colors"
          >
            {t("upgradeSuccess.startGenerating")}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px] transition-colors"
          >
            {t("upgradeSuccess.goToDashboard")}
          </Link>
        </div>
      </main>
    </>
  );
}
