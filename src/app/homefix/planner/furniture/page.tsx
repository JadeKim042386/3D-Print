"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { RoomPoint } from "@/components/RoomLayoutEditor";
import type { FurnitureProduct } from "@/types/furniture";

// ─── types ──────────────────────────────────────────────────────────────────

interface PlacedItem {
  id: string;
  productId: string;
  nameKo: string;
  widthMm: number;
  depthMm: number;
  x: number; // mm, center
  y: number; // mm, center
  rotation: number; // degrees
  color: string;
}

// ─── canvas helpers ──────────────────────────────────────────────────────────

const CANVAS_W = 480;
const CANVAS_H = 440;
const PADDING = 50;

const COLORS = [
  "#93c5fd", "#86efac", "#fcd34d", "#f9a8d4",
  "#c4b5fd", "#6ee7b7", "#fda4af", "#bef264",
];

function computeTransform(corners: RoomPoint[]) {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const roomW = maxX - minX || 1;
  const roomH = maxY - minY || 1;
  const scale = Math.min(
    (CANVAS_W - PADDING * 2) / roomW,
    (CANVAS_H - PADDING * 2) / roomH
  );
  const ox = (CANVAS_W - roomW * scale) / 2 - minX * scale;
  const oy = (CANVAS_H - roomH * scale) / 2 - minY * scale;
  return { scale, ox, oy };
}

const toSvg = (pt: RoomPoint, scale: number, ox: number, oy: number) => ({
  x: pt.x * scale + ox,
  y: pt.y * scale + oy,
});

// ─── default room (fallback) ─────────────────────────────────────────────────

const DEFAULT_CORNERS: RoomPoint[] = [
  { x: 0, y: 0 },
  { x: 3600, y: 0 },
  { x: 3600, y: 4800 },
  { x: 0, y: 4800 },
];

// ─── RoomCanvas ─────────────────────────────────────────────────────────────

function RoomCanvas({
  corners,
  items,
  selectedId,
  onSelect,
  onMove,
}: {
  corners: RoomPoint[];
  items: PlacedItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ id: string; startMmX: number; startMmY: number; svgDx: number; svgDy: number } | null>(null);

  const { scale, ox, oy } = computeTransform(corners);
  const svgPts = corners.map((c) => toSvg(c, scale, ox, oy));
  const pointsStr = svgPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const getSvgXY = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const onItemPointerDown = (e: React.PointerEvent<SVGRectElement>, item: PlacedItem) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.id);
    const { x, y } = getSvgXY(e);
    const svgCenter = toSvg({ x: item.x, y: item.y }, scale, ox, oy);
    dragging.current = {
      id: item.id,
      startMmX: item.x,
      startMmY: item.y,
      svgDx: svgCenter.x - x,
      svgDy: svgCenter.y - y,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const { x, y } = getSvgXY(e);
    const newSvgX = x + dragging.current.svgDx;
    const newSvgY = y + dragging.current.svgDy;
    const newMmX = Math.round((newSvgX - ox) / scale);
    const newMmY = Math.round((newSvgY - oy) / scale);
    onMove(dragging.current.id, newMmX, newMmY);
  };

  const onSvgPointerUp = () => { dragging.current = null; };

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="touch-none select-none rounded-xl border border-gray-200 bg-white cursor-default"
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerLeave={onSvgPointerUp}
      onClick={() => onSelect(null)}
    >
      {/* Dot grid */}
      <defs>
        <pattern id="fg-dots" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="0.9" fill="#e5e7eb" />
        </pattern>
      </defs>
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#fg-dots)" />

      {/* Room outline */}
      <polygon
        points={pointsStr}
        fill="rgba(248,250,252,0.9)"
        stroke="#94a3b8"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Placed furniture */}
      {items.map((item) => {
        const hw = (item.widthMm / 2) * scale;
        const hd = (item.depthMm / 2) * scale;
        const cx = item.x * scale + ox;
        const cy = item.y * scale + oy;
        const isSelected = item.id === selectedId;
        return (
          <g
            key={item.id}
            transform={`rotate(${item.rotation}, ${cx}, ${cy})`}
          >
            <rect
              x={cx - hw}
              y={cy - hd}
              width={hw * 2}
              height={hd * 2}
              fill={item.color}
              fillOpacity={isSelected ? 0.85 : 0.65}
              stroke={isSelected ? "#1d4ed8" : "#475569"}
              strokeWidth={isSelected ? 2 : 1}
              rx={3}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onItemPointerDown(e, item)}
              onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
            />
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              fontSize={Math.max(7, Math.min(11, hw * 0.7))}
              fill="#1e293b"
              className="pointer-events-none"
              style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
            >
              {item.nameKo}
            </text>
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              fontSize={7}
              fill="#475569"
              className="pointer-events-none"
            >
              {item.widthMm >= 1000
                ? `${(item.widthMm / 1000).toFixed(1)}m`
                : `${item.widthMm}mm`}
              ×
              {item.depthMm >= 1000
                ? `${(item.depthMm / 1000).toFixed(1)}m`
                : `${item.depthMm}mm`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Furniture catalog panel ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  all: "전체",
  sofa: "소파",
  bed: "침대",
  desk: "책상",
  table: "테이블",
  chair: "의자",
  storage: "수납",
};

function CatalogPanel({
  onAdd,
}: {
  onAdd: (p: FurnitureProduct) => void;
}) {
  const [products, setProducts] = useState<FurnitureProduct[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products?category=${category}`)
      .then((r) => r.json())
      .then((data: FurnitureProduct[]) => {
        setProducts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [category]);

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap mb-3">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              category === key
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">상품 없음</p>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.nameKo}</p>
                <p className="text-xs text-gray-400 font-mono">
                  {p.widthCm}×{p.depthCm}×{p.heightCm}cm
                </p>
                {p.priceKrw > 0 && (
                  <p className="text-xs text-gray-500">
                    ₩{p.priceKrw.toLocaleString("ko-KR")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAdd(p)}
                className="ml-2 shrink-0 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
              >
                + 배치
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

function FurniturePlannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const colorIdx = useRef(0);

  const corners: RoomPoint[] = (() => {
    try {
      const raw = searchParams.get("room");
      if (!raw) return DEFAULT_CORNERS;
      return JSON.parse(decodeURIComponent(raw)) as RoomPoint[];
    } catch {
      return DEFAULT_CORNERS;
    }
  })();

  const [items, setItems] = useState<PlacedItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const addFurniture = useCallback((p: FurnitureProduct) => {
    const color = COLORS[colorIdx.current % COLORS.length];
    colorIdx.current += 1;

    // Place near room center
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

    const newItem: PlacedItem = {
      id: `${p.id}-${Date.now()}`,
      productId: p.id,
      nameKo: p.nameKo,
      widthMm: p.widthCm * 10,
      depthMm: p.depthCm * 10,
      x: cx,
      y: cy,
      rotation: 0,
      color,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
  }, [corners]);

  const moveItem = useCallback((id: string, x: number, y: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, x, y } : it)));
  }, []);

  const rotateSelected = () => {
    if (!selectedId) return;
    setItems((prev) =>
      prev.map((it) => it.id === selectedId ? { ...it, rotation: (it.rotation + 90) % 360 } : it)
    );
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  };

  const handleNext = () => {
    const roomEncoded = encodeURIComponent(JSON.stringify(corners));
    const furnitureEncoded = encodeURIComponent(JSON.stringify(
      items.map((it) => ({
        productId: it.productId,
        nameKo: it.nameKo,
        widthMm: it.widthMm,
        depthMm: it.depthMm,
        x: it.x,
        y: it.y,
        rotation: it.rotation,
      }))
    ));
    router.push(`/homefix/planner/render?room=${roomEncoded}&furniture=${furnitureEncoded}`);
  };

  const selectedItem = items.find((it) => it.id === selectedId);

  return (
    <div className="min-h-[calc(100vh-57px)] px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-5xl">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex items-center gap-2 opacity-50">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">✓</span>
            <span className="text-sm font-medium text-gray-500">공간 설정</span>
          </div>
          <div className="h-px flex-1 bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">2</span>
            <span className="text-sm font-semibold text-gray-900">가구 배치</span>
          </div>
          <div className="h-px flex-1 bg-gray-200" />
          <div className="flex items-center gap-2 opacity-40">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-gray-400">3</span>
            <span className="text-sm font-medium text-gray-400">렌더링</span>
          </div>
        </div>

        <h1 className="mb-1 text-2xl sm:text-3xl font-bold text-gray-900">가구 배치</h1>
        <p className="mb-6 text-sm text-gray-500">
          좌측 카탈로그에서 가구를 선택해 배치하세요. 캔버스에서 드래그해 위치를 조정할 수 있습니다.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Catalog */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 h-[520px] flex flex-col">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">가구 카탈로그</h2>
            <CatalogPanel onAdd={addFurniture} />
          </div>

          {/* Canvas area */}
          <div className="flex flex-col gap-3">
            {/* Selection toolbar */}
            {selectedItem && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
                <span className="text-sm font-medium text-blue-900 flex-1">
                  {selectedItem.nameKo} 선택됨
                  <span className="ml-2 text-xs text-blue-600 font-mono">
                    ({Math.round(selectedItem.x / 10)}cm, {Math.round(selectedItem.y / 10)}cm)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={rotateSelected}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  ↺ 회전
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  삭제
                </button>
              </div>
            )}

            <RoomCanvas
              corners={corners}
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={moveItem}
            />

            <p className="text-xs text-gray-400 text-center">
              가구 클릭 선택 · 드래그로 이동 · 회전/삭제는 상단 툴바 사용
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← 이전: 공간 설정
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{items.length}개 가구 배치됨</span>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              다음: 3D 렌더링 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FurniturePlannerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-57px)]"><p className="text-gray-400">불러오는 중...</p></div>}>
      <FurniturePlannerContent />
    </Suspense>
  );
}
