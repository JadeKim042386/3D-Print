"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import FurniturePlacer from "@/components/FurniturePlacer";
import type { RoomDimensions } from "@/components/RoomSetupEditor";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function trpcQuery(path: string, input: unknown, token: string) {
  const url = `${API_BASE_URL}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

function StepIndicator() {
  const steps = [
    { n: 1, label: "공간 설정" },
    { n: 2, label: "가구 배치" },
    { n: 3, label: "3D 렌더링" },
  ] as const;

  return (
    <div className="mb-8 flex items-center gap-3">
      {steps.map((s, i) => {
        const done = s.n < 2;
        const active = s.n === 2;
        return (
          <div key={s.n} className="contents">
            <div className={`flex items-center gap-2 ${!active && !done ? "opacity-40" : ""}`}>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-gray-900 text-white"
                    : done
                      ? "bg-gray-400 text-white"
                      : "border-2 border-gray-300 text-gray-400"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span
                className={`text-sm ${active ? "font-semibold text-gray-900" : "font-medium text-gray-400"}`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 bg-gray-200 ${!active && !done ? "opacity-40" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PlannerFurniturePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);

  const [dims, setDims] = useState<RoomDimensions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) return;
    trpcQuery("homefix.staging.get", { id: projectId }, accessToken)
      .then((data) => {
        setDims({
          room_width_mm: data.room_width_mm,
          room_depth_mm: data.room_depth_mm,
          room_height_mm: data.room_height_mm,
          l_width_mm: data.l_width_mm ?? undefined,
          l_depth_mm: data.l_depth_mm ?? undefined,
        });
      })
      .catch(() => setError("프로젝트를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [projectId, accessToken]);

  if (!accessToken) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
        <p className="text-sm text-gray-500">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <StepIndicator />

        <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">가구 배치</h1>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">
          카탈로그에서 가구를 선택해 방에 배치하세요. 가구를 드래그하여 이동하고 선택 후 회전·삭제할 수 있습니다.
        </p>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : error || !dims ? (
          <p className="py-12 text-center text-sm text-red-500">{error ?? "프로젝트를 찾을 수 없습니다."}</p>
        ) : (
          <FurniturePlacer projectId={projectId} dims={dims} token={accessToken} />
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/homefix/setup")}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={() => router.push(`/homefix/planner/${projectId}`)}
            disabled={loading || !!error}
            className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
          >
            다음: 3D 렌더링 →
          </button>
        </div>
      </div>
    </div>
  );
}
