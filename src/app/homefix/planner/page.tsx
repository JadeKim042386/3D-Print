"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RoomLayoutEditor, { type RoomPoint } from "@/components/RoomLayoutEditor";

// Default 3600 × 4800mm (Korean standard living-room)
const DEFAULT_CORNERS: RoomPoint[] = [
  { x: 0, y: 0 },
  { x: 3600, y: 0 },
  { x: 3600, y: 4800 },
  { x: 0, y: 4800 },
];

const PRESET_ROOMS: { labelKo: string; corners: RoomPoint[] }[] = [
  {
    labelKo: "직사각형 (3.6 × 4.8m)",
    corners: [
      { x: 0, y: 0 },
      { x: 3600, y: 0 },
      { x: 3600, y: 4800 },
      { x: 0, y: 4800 },
    ],
  },
  {
    labelKo: "정사각형 (4.0 × 4.0m)",
    corners: [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
    ],
  },
  {
    labelKo: "L자형",
    corners: [
      { x: 0, y: 0 },
      { x: 5400, y: 0 },
      { x: 5400, y: 2700 },
      { x: 2700, y: 2700 },
      { x: 2700, y: 5400 },
      { x: 0, y: 5400 },
    ],
  },
  {
    labelKo: "넓은 거실 (5.0 × 6.0m)",
    corners: [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 6000 },
      { x: 0, y: 6000 },
    ],
  },
];

export default function HomefixPlannerPage() {
  const router = useRouter();
  const [corners, setCorners] = useState<RoomPoint[]>(DEFAULT_CORNERS);

  const applyPreset = (preset: RoomPoint[]) => setCorners([...preset]);

  const handleNext = () => {
    // Serialize room layout and navigate to furniture placement step
    const encoded = encodeURIComponent(JSON.stringify(corners));
    router.push(`/homefix/planner/furniture?room=${encoded}`);
  };

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
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
            <span className="text-sm font-medium text-gray-400">렌더링</span>
          </div>
        </div>

        <h1 className="mb-2 text-2xl sm:text-3xl font-bold text-gray-900">
          공간 레이아웃 설정
        </h1>
        <p className="mb-6 text-gray-500 text-sm leading-relaxed">
          방의 형태와 치수를 설정하세요. 꼭짓점을 드래그하거나 치수를 직접 입력할 수 있습니다.
          모서리 중간의 <strong>+</strong> 버튼을 눌러 꼭짓점을 추가하고 원하는 형태로 만드세요.
        </p>

        {/* Presets */}
        <div className="mb-5 flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-gray-400 mr-1">프리셋:</span>
          {PRESET_ROOMS.map((p) => (
            <button
              key={p.labelKo}
              type="button"
              onClick={() => applyPreset(p.corners)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              {p.labelKo}
            </button>
          ))}
        </div>

        {/* Room layout editor */}
        <RoomLayoutEditor initialCorners={corners} onChange={setCorners} />

        {/* Tip */}
        <p className="mt-3 text-xs text-gray-400 text-center">
          치수 레이블을 클릭하면 직접 입력할 수 있습니다 · 꼭짓점을 드래그하여 모양을 변경하세요 · 꼭짓점 더블클릭으로 삭제
        </p>

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
            onClick={handleNext}
            className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            다음: 가구 배치 →
          </button>
        </div>
      </div>
    </div>
  );
}
