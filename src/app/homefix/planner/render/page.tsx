"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { RoomPoint } from "@/components/RoomLayoutEditor";

interface PlacedFurniture {
  productId: string;
  nameKo: string;
  widthMm: number;
  depthMm: number;
  x: number;
  y: number;
  rotation: number;
}

function buildPrompt(corners: RoomPoint[], furniture: PlacedFurniture[]): string {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const roomW = Math.round((Math.max(...xs) - Math.min(...xs)) / 10);
  const roomD = Math.round((Math.max(...ys) - Math.min(...ys)) / 10);

  const furnitureDesc = furniture
    .map((f) => `${f.nameKo}(${f.widthMm / 10}×${f.depthMm / 10}cm)`)
    .join(", ");

  return `Korean apartment interior room ${roomW}cm × ${roomD}cm, photorealistic 3D render, furniture: ${furnitureDesc || "empty room"}, modern style, natural lighting`;
}

function RenderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGenerating, setIsGenerating] = useState(false);

  const corners: RoomPoint[] = (() => {
    try { return JSON.parse(decodeURIComponent(searchParams.get("room") ?? "[]")); }
    catch { return [{ x: 0, y: 0 }, { x: 3600, y: 0 }, { x: 3600, y: 4800 }, { x: 0, y: 4800 }]; }
  })();

  const furniture: PlacedFurniture[] = (() => {
    try { return JSON.parse(decodeURIComponent(searchParams.get("furniture") ?? "[]")); }
    catch { return []; }
  })();

  const prompt = buildPrompt(corners, furniture);

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const roomWcm = Math.round((Math.max(...xs) - Math.min(...xs)) / 10);
  const roomDcm = Math.round((Math.max(...ys) - Math.min(...ys)) / 10);

  const handleGenerate = () => {
    setIsGenerating(true);
    // Navigate to the main 3D generation flow with the pre-filled prompt
    setTimeout(() => {
      router.push(`/?prompt=${encodeURIComponent(prompt)}`);
    }, 400);
  };

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          {[
            { n: "✓", label: "공간 설정" },
            { n: "✓", label: "가구 배치" },
            { n: "3", label: "렌더링" },
          ].map((s, i) => (
            <div key={i} className={`flex items-center gap-2 ${i < 2 ? "opacity-50" : ""}`}>
              {i > 0 && <div className={`h-px w-8 sm:w-12 ${i < 2 ? "bg-gray-300" : "bg-gray-300"}`} />}
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">{s.n}</span>
              <span className={`text-sm ${i === 2 ? "font-semibold text-gray-900" : "font-medium text-gray-500"}`}>{s.label}</span>
            </div>
          ))}
        </div>

        <h1 className="mb-2 text-2xl sm:text-3xl font-bold text-gray-900">3D 렌더링 생성</h1>
        <p className="mb-8 text-sm text-gray-500">
          설정한 공간과 가구 배치를 바탕으로 AI가 실사 3D 렌더링을 생성합니다.
        </p>

        {/* Summary card */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 mb-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">공간 크기</p>
            <p className="text-sm font-medium text-gray-900">
              {roomWcm}cm × {roomDcm}cm ({corners.length}개 꼭짓점)
            </p>
          </div>
          {furniture.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">배치된 가구 ({furniture.length}개)</p>
              <div className="flex flex-wrap gap-1.5">
                {furniture.map((f, i) => (
                  <span key={i} className="rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-700">
                    {f.nameKo}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">생성 프롬프트</p>
            <p className="text-xs text-gray-500 font-mono leading-relaxed bg-white rounded-lg border border-gray-100 p-3">
              {prompt}
            </p>
          </div>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGenerating ? "이동 중..." : "AI 3D 렌더링 생성 →"}
        </button>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← 가구 배치로 돌아가기
          </button>
          <Link href="/homefix/planner" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            처음부터 다시 →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RenderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-57px)]"><p className="text-gray-400">불러오는 중...</p></div>}>
      <RenderContent />
    </Suspense>
  );
}
