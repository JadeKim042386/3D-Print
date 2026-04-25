"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const CAMERA_LABELS: Record<string, string> = {
  perspective: "원근감 (기본)",
  top: "위에서 내려보기",
  corner_ne: "북동쪽 코너",
  corner_nw: "북서쪽 코너",
  corner_se: "남동쪽 코너",
  corner_sw: "남서쪽 코너",
};

type CameraPreset = keyof typeof CAMERA_LABELS;

interface FurnitureItem {
  name_ko: string;
  width_mm: number;
  depth_mm: number;
  height_mm: number;
  price_krw: number;
}

interface Placement {
  id: string;
  x_mm: number;
  y_mm: number;
  homefix_furniture: FurnitureItem;
}

interface Project {
  id: string;
  name: string;
  room_type: string;
  room_width_mm: number;
  room_depth_mm: number;
  room_height_mm: number;
  l_width_mm?: number | null;
  l_depth_mm?: number | null;
  placements: Placement[];
}

function fmtPrice(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function fmtMm(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)}m` : `${mm}mm`;
}

async function trpcQuery(path: string, input: unknown, token: string) {
  const url = `${API_BASE_URL}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

async function trpcMutation(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

export default function PlannerRenderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [camera, setCamera] = useState<CameraPreset>("perspective");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) return;
    trpcQuery("homefix.staging.get", { json: { id: projectId } }, accessToken)
      .then((data) => setProject(data))
      .catch(() => setError("프로젝트를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [projectId, accessToken]);

  const handleRender = async () => {
    if (!accessToken || !projectId) return;
    setRendering(true);
    setError(null);
    try {
      const result = await trpcMutation(
        "homefix.render.trigger",
        { json: { project_id: projectId, camera_preset: camera } },
        accessToken,
      );
      // Navigate to job status or model view
      if (result?.model_id) {
        router.push(`/models/${result.model_id}`);
      } else if (result?.job_id) {
        router.push(`/models/${result.job_id}`);
      } else {
        router.push("/homefix");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "렌더링 요청에 실패했습니다.");
      setRendering(false);
    }
  };

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
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          {[
            { n: 1, label: "공간 설정" },
            { n: 2, label: "가구 배치" },
            { n: 3, label: "3D 렌더링" },
          ].map((s, i) => (
            <div key={s.n} className="contents">
              <div className={`flex items-center gap-2 ${s.n < 3 ? "opacity-40" : ""}`}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    s.n === 3
                      ? "bg-gray-900 text-white"
                      : "border-2 border-gray-300 text-gray-400"
                  }`}
                >
                  {s.n < 3 ? "✓" : s.n}
                </span>
                <span
                  className={`text-sm ${s.n === 3 ? "font-semibold text-gray-900" : "font-medium text-gray-400"}`}
                >
                  {s.label}
                </span>
              </div>
              {i < 2 && <div className={`h-px flex-1 bg-gray-200 ${s.n < 3 ? "opacity-40" : ""}`} />}
            </div>
          ))}
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">3D 렌더링</h1>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">
          설정한 공간과 가구를 AI가 실사 3D로 렌더링합니다. 카메라 앵글을 선택하고 생성을 시작하세요.
        </p>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : project ? (
          <>
            {/* Room summary */}
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">공간 요약</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-gray-400">이름</dt>
                  <dd className="font-medium text-gray-900">{project.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">종류</dt>
                  <dd className="font-medium text-gray-900">{project.room_type}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">가로</dt>
                  <dd className="font-medium text-gray-900">{fmtMm(project.room_width_mm)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">세로</dt>
                  <dd className="font-medium text-gray-900">{fmtMm(project.room_depth_mm)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">천장 높이</dt>
                  <dd className="font-medium text-gray-900">{fmtMm(project.room_height_mm)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">배치 가구</dt>
                  <dd className="font-medium text-gray-900">{project.placements.length}개</dd>
                </div>
              </dl>
            </div>

            {/* Furniture list */}
            {project.placements.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">배치된 가구</h2>
                <ul className="flex flex-col gap-2">
                  {project.placements.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-900">{p.homefix_furniture.name_ko}</span>
                      <span className="text-xs text-gray-400">
                        {fmtPrice(p.homefix_furniture.price_krw)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-gray-100 pt-3 text-right text-sm">
                  <span className="text-gray-400">가구 합계 </span>
                  <span className="font-semibold text-gray-900">
                    {fmtPrice(
                      project.placements.reduce(
                        (sum, p) => sum + p.homefix_furniture.price_krw,
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Camera preset */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-gray-700">카메라 앵글</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.entries(CAMERA_LABELS) as [CameraPreset, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCamera(key)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                      camera === key
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push(`/homefix/setup`)}
                className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                ← 처음으로
              </button>
              <button
                type="button"
                onClick={handleRender}
                disabled={rendering}
                className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
              >
                {rendering ? "렌더링 중…" : "✦ 3D 렌더링 생성"}
              </button>
            </div>
          </>
        ) : (
          <p className="py-12 text-center text-sm text-red-500">{error ?? "프로젝트를 찾을 수 없습니다."}</p>
        )}
      </div>
    </div>
  );
}
