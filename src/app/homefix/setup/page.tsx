"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import RoomSetupEditor, { type RoomDimensions } from "@/components/RoomSetupEditor";
import FurniturePlacer from "@/components/FurniturePlacer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ROOM_TYPES = ["거실", "침실", "주방", "화장실", "발코니", "기타"] as const;
type RoomType = (typeof ROOM_TYPES)[number];

const PRESETS: { label: string; dims: RoomDimensions }[] = [
  { label: "소형 침실 (3.0×3.6m)", dims: { room_width_mm: 3000, room_depth_mm: 3600, room_height_mm: 2400 } },
  { label: "표준 거실 (3.6×4.8m)", dims: { room_width_mm: 3600, room_depth_mm: 4800, room_height_mm: 2400 } },
  { label: "넓은 거실 (5.0×6.0m)", dims: { room_width_mm: 5000, room_depth_mm: 6000, room_height_mm: 2400 } },
  {
    label: "L형 거실",
    dims: { room_width_mm: 5400, room_depth_mm: 5400, room_height_mm: 2400, l_width_mm: 2200, l_depth_mm: 2200 },
  },
];

async function createStagingProject(
  token: string,
  input: {
    name: string;
    room_type: RoomType;
    room_width_mm: number;
    room_depth_mm: number;
    room_height_mm: number;
    l_width_mm?: number;
    l_depth_mm?: number;
  },
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/trpc/homefix.staging.create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to create project: ${err}`);
  }

  const json = await res.json();
  return json.result?.data?.json ?? json.result?.data ?? json;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "공간 설정" },
    { n: 2, label: "가구 배치" },
    { n: 3, label: "3D 렌더링" },
  ] as const;

  return (
    <div className="mb-8 flex items-center gap-3">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomefixSetupPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("내 공간");
  const [roomType, setRoomType] = useState<RoomType>("거실");
  const [dims, setDims] = useState<RoomDimensions>({
    room_width_mm: 3600,
    room_depth_mm: 4800,
    room_height_mm: 2400,
  });

  // Step 1 save → step 2
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStep1Next = async () => {
    if (!accessToken) {
      router.push("/auth");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const project = await createStagingProject(accessToken, {
        name,
        room_type: roomType,
        ...dims,
      });
      setProjectId(project.id);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleStep2Next = () => {
    if (projectId) {
      router.push(`/homefix/planner/${projectId}`);
    }
  };

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <StepIndicator current={1} />

          <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">공간 레이아웃 설정</h1>
          <p className="mb-7 text-sm leading-relaxed text-gray-500">
            공간 이름과 종류를 선택하고 방의 치수를 설정하세요. 핸들을 드래그하거나 치수를 직접 입력할 수 있습니다.
          </p>

          {/* Space name + room type */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">공간 이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">공간 종류</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Presets */}
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="mr-1 self-center text-xs font-medium text-gray-400">프리셋:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDims({ ...p.dims })}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Room layout editor */}
          <RoomSetupEditor value={dims} onChange={setDims} />

          {error && (
            <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              ← 이전
            </button>
            <button
              type="button"
              onClick={handleStep1Next}
              disabled={saving}
              className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
            >
              {saving ? "저장 중…" : "다음: 가구 배치 →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <StepIndicator current={2} />

        <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">가구 배치</h1>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">
          카탈로그에서 가구를 선택해 방에 배치하세요. 가구를 드래그하여 이동하고 선택 후 회전·삭제할 수 있습니다.
        </p>

        {projectId && accessToken && (
          <FurniturePlacer projectId={projectId} dims={dims} token={accessToken} />
        )}

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={handleStep2Next}
            className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            다음: 3D 렌더링 →
          </button>
        </div>
      </div>
    </div>
  );
}
