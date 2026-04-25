"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { RoomDimensions } from "./RoomSetupEditor";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 520;
const CANVAS_H = 420;
const PADDING = 48;

const CATEGORIES = [
  "전체", "소파", "침대", "식탁/의자", "수납장", "TV장",
  "책상", "주방가구", "욕실가구", "기타",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FurnitureItem {
  id: string;
  name_ko: string;
  category: string;
  width_mm: number;
  depth_mm: number;
  height_mm: number;
  price_krw: number;
  brand: string | null;
  image_url: string | null;
}

interface Placement {
  id: string;
  furniture_id: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
  furniture?: FurnitureItem;
}

export interface FurniturePlacerProps {
  projectId: string;
  dims: RoomDimensions;
  token: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeTransform(dims: RoomDimensions) {
  const scale = Math.min(
    (CANVAS_W - PADDING * 2) / dims.room_width_mm,
    (CANVAS_H - PADDING * 2) / dims.room_depth_mm,
  );
  const ox = (CANVAS_W - dims.room_width_mm * scale) / 2;
  const oy = (CANVAS_H - dims.room_depth_mm * scale) / 2;
  return { scale, ox, oy };
}

function buildPolygonStr(
  dims: RoomDimensions,
  scale: number,
  ox: number,
  oy: number,
): string {
  const { room_width_mm: W, room_depth_mm: D, l_width_mm: lw, l_depth_mm: ld } = dims;
  const pts =
    lw && ld
      ? [
          { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: ld },
          { x: W - lw, y: ld }, { x: W - lw, y: D }, { x: 0, y: D },
        ]
      : [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  return pts
    .map((p) => `${(p.x * scale + ox).toFixed(1)},${(p.y * scale + oy).toFixed(1)}`)
    .join(" ");
}

function fmtPrice(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function fmtDim(w: number, d: number, h: number): string {
  return `${(w / 10).toFixed(0)}×${(d / 10).toFixed(0)}×${(h / 10).toFixed(0)}cm`;
}

// ─── tRPC helpers ─────────────────────────────────────────────────────────────

async function trpcQuery(path: string, input: unknown, token: string) {
  const url = `${API_BASE_URL}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} query failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

async function trpcMutation(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} mutation failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

// ─── Thumbnail placeholder ────────────────────────────────────────────────────

function FurnitureThumbnail({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex h-16 w-full items-center justify-center rounded-lg bg-gray-100">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-4 0v2" />
          <path d="M8 7V5a2 2 0 0 1 4 0" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className="h-16 w-full rounded-lg object-cover"
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FurniturePlacer({ projectId, dims, token }: FurniturePlacerProps) {
  const [category, setCategory] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [catalog, setCatalog] = useState<FurnitureItem[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    placementId: string;
    startSvgX: number;
    startSvgY: number;
    startXmm: number;
    startYmm: number;
    curXmm: number;
    curYmm: number;
  } | null>(null);

  const { scale, ox, oy } = computeTransform(dims);
  const polygonStr = buildPolygonStr(dims, scale, ox, oy);

  // ── Debounce search input ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch catalog when category or search changes ──────────────────────────
  useEffect(() => {
    setLoadingCatalog(true);
    const inputObj: Record<string, unknown> = { limit: 20 };
    if (category !== "전체") inputObj.category = category;
    if (debouncedSearch.trim()) inputObj.query = debouncedSearch.trim();

    trpcQuery("homefix.catalog.list", { json: inputObj }, token)
      .then((result) => setCatalog(result?.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingCatalog(false));
  }, [category, debouncedSearch, token]);

  // ── Load existing placements for this project ──────────────────────────────
  useEffect(() => {
    trpcQuery("homefix.staging.get", { json: { id: projectId } }, token)
      .then((result) => {
        if (Array.isArray(result?.placements)) {
          setPlacements(
            result.placements.map((p: Record<string, unknown>) => ({
              id: p.id as string,
              furniture_id: p.furniture_id as string,
              x_mm: p.x_mm as number,
              y_mm: p.y_mm as number,
              rotation_deg: (p.rotation_deg as number) ?? 0,
              furniture: p.furniture_catalog as FurnitureItem | undefined,
            })),
          );
        }
      })
      .catch(() => {});
  }, [projectId, token]);

  // ── Add furniture with AI auto-placement ──────────────────────────────────
  const addFurniture = async (item: FurnitureItem) => {
    setAddingId(item.id);
    let x_mm: number;
    let y_mm: number;
    let rotation_deg = 0;

    // Try AI auto-placement; fall back to room-center on any error
    try {
      const autoResult = await trpcMutation(
        "homefix.staging.autoPlace",
        { json: { project_id: projectId, furniture_id: item.id, k: 3 } },
        token,
      );
      if (autoResult?.best) {
        x_mm = autoResult.best.x_mm;
        y_mm = autoResult.best.y_mm;
        rotation_deg = autoResult.best.rotation_deg ?? 0;
      } else {
        x_mm = Math.max(0, Math.round((dims.room_width_mm - item.width_mm) / 2));
        y_mm = Math.max(0, Math.round((dims.room_depth_mm - item.depth_mm) / 2));
      }
    } catch {
      x_mm = Math.max(0, Math.round((dims.room_width_mm - item.width_mm) / 2));
      y_mm = Math.max(0, Math.round((dims.room_depth_mm - item.depth_mm) / 2));
    }

    try {
      const result = await trpcMutation(
        "homefix.staging.addFurniture",
        { json: { project_id: projectId, furniture_id: item.id, x_mm, y_mm, rotation_deg } },
        token,
      );
      if (result?.id) {
        setPlacements((prev) => [
          ...prev,
          { id: result.id, furniture_id: item.id, x_mm, y_mm, rotation_deg, furniture: item },
        ]);
      }
    } catch {}
    setAddingId(null);
  };

  // ── Rotate selected item 90° CW ───────────────────────────────────────────
  const rotateSelected = async () => {
    if (!selectedId) return;
    const p = placements.find((x) => x.id === selectedId);
    if (!p) return;
    const newRot = Math.round((p.rotation_deg + 90) % 360);
    setPlacements((prev) =>
      prev.map((x) => (x.id === selectedId ? { ...x, rotation_deg: newRot } : x)),
    );
    await trpcMutation(
      "homefix.staging.updatePlacement",
      { json: { placement_id: selectedId, rotation_deg: newRot } },
      token,
    ).catch(() => {});
  };

  // ── Delete selected item ──────────────────────────────────────────────────
  const deleteSelected = async () => {
    if (!selectedId) return;
    const id = selectedId;
    setPlacements((prev) => prev.filter((x) => x.id !== id));
    setSelectedId(null);
    await trpcMutation(
      "homefix.staging.removeFurniture",
      { json: { placement_id: id } },
      token,
    ).catch(() => {});
  };

  // ── SVG pointer helpers ───────────────────────────────────────────────────
  const getSvgXY = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const onItemPointerDown = (e: React.PointerEvent, placementId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = getSvgXY(e);
    const p = placements.find((pl) => pl.id === placementId)!;
    dragRef.current = {
      placementId,
      startSvgX: x,
      startSvgY: y,
      startXmm: p.x_mm,
      startYmm: p.y_mm,
      curXmm: p.x_mm,
      curYmm: p.y_mm,
    };
    setSelectedId(placementId);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const { x, y } = getSvgXY(e);
      const dx = (x - dragRef.current.startSvgX) / scale;
      const dy = (y - dragRef.current.startSvgY) / scale;
      const newX = Math.max(0, Math.round(dragRef.current.startXmm + dx));
      const newY = Math.max(0, Math.round(dragRef.current.startYmm + dy));
      dragRef.current.curXmm = newX;
      dragRef.current.curYmm = newY;
      const id = dragRef.current.placementId;
      setPlacements((prev) =>
        prev.map((p) => (p.id === id ? { ...p, x_mm: newX, y_mm: newY } : p)),
      );
    },
    [scale],
  );

  const onSvgPointerUp = useCallback(async () => {
    if (!dragRef.current) return;
    const { placementId, curXmm, curYmm } = dragRef.current;
    dragRef.current = null;
    await trpcMutation(
      "homefix.staging.updatePlacement",
      { json: { placement_id: placementId, x_mm: curXmm, y_mm: curYmm } },
      token,
    ).catch(() => {});
  }, [token]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* ── Furniture catalog ── */}
      <div>
        {/* Search input */}
        <div className="mb-3 relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="가구 이름 검색…"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pl-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {/* Category filter */}
        <div className="mb-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                category === c
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Catalog grid */}
        <div className="grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3" style={{ maxHeight: 260 }}>
          {loadingCatalog ? (
            <p className="col-span-3 py-6 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : catalog.length === 0 ? (
            <p className="col-span-3 py-6 text-center text-sm text-gray-400">
              {debouncedSearch ? `"${debouncedSearch}" 검색 결과 없음` : "가구가 없습니다"}
            </p>
          ) : (
            catalog.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-3"
              >
                <FurnitureThumbnail url={item.image_url} name={item.name_ko} />
                <p className="line-clamp-2 text-xs font-semibold leading-tight text-gray-900">
                  {item.name_ko}
                </p>
                <p className="text-xs text-gray-400">
                  {fmtDim(item.width_mm, item.depth_mm, item.height_mm)}
                </p>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-gray-700">
                    {fmtPrice(item.price_krw)}
                  </span>
                  <button
                    type="button"
                    onClick={() => addFurniture(item)}
                    disabled={addingId === item.id}
                    className="min-h-[28px] rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    {addingId === item.id ? "배치 중…" : "+ 배치"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Placement canvas ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">배치 캔버스</span>
            {placements.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                {placements.length}개
              </span>
            )}
          </div>
          {selectedId && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={rotateSelected}
                className="min-h-[32px] rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                ↻ 회전
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                className="min-h-[32px] rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="touch-none select-none"
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerCancel={onSvgPointerUp}
            onClick={() => setSelectedId(null)}
          >
            <defs>
              <pattern id="fp-dots" width="12" height="12" patternUnits="userSpaceOnUse">
                <circle cx="6" cy="6" r="0.9" fill="#e5e7eb" />
              </pattern>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#fp-dots)" />

            {/* Room outline */}
            <polygon
              points={polygonStr}
              fill="rgba(59,130,246,0.05)"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* Placed furniture */}
            {placements.map((p) => {
              const f = p.furniture;
              if (!f) return null;
              const w = f.width_mm * scale;
              const d = f.depth_mm * scale;
              const px = p.x_mm * scale + ox;
              const py = p.y_mm * scale + oy;
              const cx = px + w / 2;
              const cy = py + d / 2;
              const isSelected = p.id === selectedId;
              return (
                <g
                  key={p.id}
                  transform={`rotate(${p.rotation_deg}, ${cx.toFixed(1)}, ${cy.toFixed(1)})`}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onItemPointerDown(e, p.id)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <rect
                    x={px}
                    y={py}
                    width={w}
                    height={d}
                    rx={3}
                    fill={isSelected ? "rgba(59,130,246,0.25)" : "rgba(107,114,128,0.15)"}
                    stroke={isSelected ? "#2563eb" : "#6b7280"}
                    strokeWidth={isSelected ? 2 : 1.5}
                  />
                  {w > 28 && d > 18 && (
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fontSize={Math.max(8, Math.min(11, w / 7))}
                      fill={isSelected ? "#1d4ed8" : "#374151"}
                      className="pointer-events-none"
                    >
                      {f.name_ko.slice(0, 6)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {placements.length === 0 && (
          <p className="text-center text-xs text-gray-400">
            위 카탈로그에서 가구를 선택해 AI 자동 배치하세요
          </p>
        )}
        {placements.length > 0 && (
          <p className="text-center text-xs text-gray-400">
            가구를 드래그하여 이동 · 클릭하여 선택 후 회전/삭제
          </p>
        )}
      </div>
    </div>
  );
}
