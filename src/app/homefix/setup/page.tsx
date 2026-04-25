"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import RoomSetupEditor, { type RoomDimensions } from "@/components/RoomSetupEditor";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ROOM_TYPES = ["거실", "침실", "주방", "화장실", "발코니", "기타"] as const;
type RoomType = (typeof ROOM_TYPES)[number];

const PRESETS: { label: string; dims: RoomDimensions }[] = [
  { label: "소형 침실 (3.0×3.6m)",  dims: { room_width_mm: 3000, room_depth_mm: 3600, room_height_mm: 2400 } },
  { label: "표준 거실 (3.6×4.8m)",  dims: { room_width_mm: 3600, room_depth_mm: 4800, room_height_mm: 2400 } },
  { label: "넓은 거실 (5.0×6.0m)",  dims: { room_width_mm: 5000, room_depth_mm: 6000, room_height_mm: 2400 } },
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
  }
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

export default function HomefixSetupPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [name, setName] = useState("내 공간");
  const [roomType, setRoomType] = useState<RoomType>("거실");
  const [dims, setDims] = useState<RoomDimensions>({
    room_width_mm: 3600,
    room_depth_mm: 4800,
    room_height_mm: 2400,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
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
      router.push(`/homefix/planner/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
              1
            </span>
            <span className="text-sm font-semibold text-gray-900">공간 설정</span>
          </div>
          <div className="h-px flex-1 bg-gray-200" />
          <div className="flex items-center gap-2 opacity-40">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-gray-400">
              2
            </span>
            <span className="text-sm font-medium text-gray-400">가구 배치</span>
          </div>
          <div className="h-px flex-1 bg-gray-200 opacity-40" />
          <div className="flex items-center gap-2 opacity-40">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-gray-400">
              3
            </span>
            <span className="text-sm font-medium text-gray-400">3D 렌더링</span>
          </div>
        </div>

        <h1 className="mb-2 text-2xl sm:text-3xl font-bold text-gray-900">공간 레이아웃 설정</h1>
        <p className="mb-7 text-sm text-gray-500 leading-relaxed">
          공간 이름과 종류를 선택하고 방의 치수를 설정하세요. 핸들을 드래그하거나 치수를 직접 입력할 수 있습니다.
        </p>

        {/* Space name + room type */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">공간 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">공간 종류</label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as RoomType)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none bg-white"
            >
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Presets */}
        <div className="mb-5 flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-gray-400 mr-1">프리셋:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDims({ ...p.dims })}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Room layout editor */}
        <RoomSetupEditor value={dims} onChange={setDims} />

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {saving ? "저장 중..." : "다음: 가구 배치 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
