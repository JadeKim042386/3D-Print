"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomShape = "rect" | "l-shape";

export interface RoomDimensions {
  room_width_mm: number;
  room_depth_mm: number;
  room_height_mm: number;
  l_width_mm?: number;
  l_depth_mm?: number;
}

export interface RoomSetupEditorProps {
  value: RoomDimensions;
  onChange: (v: RoomDimensions) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 520;
const CANVAS_H = 440;
const PADDING = 72;
const SNAP_MM = 50;
const MIN_MM = 500;
const MAX_MM = 20000;
const HANDLE_R = 8;
const LABEL_W = 72;
const LABEL_H = 22;

// ─── Handle keys ─────────────────────────────────────────────────────────────
//
//  Rect corners (origin = top-left, fixed):
//    tr  – top-right    → drag X: width
//    bl  – bottom-left  → drag Y: depth
//    br  – bottom-right → drag X: width, drag Y: depth
//
//  L-shape inner corner:
//    li  – inner corner of the cut-out → drag X: l_width, drag Y: l_depth
//
// ─────────────────────────────────────────────────────────────────────────────

type HandleKey = "tr" | "bl" | "br" | "li";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampMm(v: number): number {
  return Math.max(MIN_MM, Math.min(MAX_MM, Math.round(v / SNAP_MM) * SNAP_MM));
}

function fmtMm(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm} mm`;
}

function buildPolygon(
  dims: RoomDimensions,
  scale: number,
  ox: number,
  oy: number,
): { x: number; y: number }[] {
  const { room_width_mm: W, room_depth_mm: D, l_width_mm: lw, l_depth_mm: ld } = dims;

  if (lw && ld) {
    // L-shape: full rect with top-right corner cut out
    return [
      { x: 0,      y: 0  },
      { x: W - lw, y: 0  },
      { x: W - lw, y: ld },
      { x: W,      y: ld },
      { x: W,      y: D  },
      { x: 0,      y: D  },
    ].map((p) => ({ x: p.x * scale + ox, y: p.y * scale + oy }));
  }

  return [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ].map((p) => ({ x: p.x * scale + ox, y: p.y * scale + oy }));
}

function computeTransform(dims: RoomDimensions): { scale: number; ox: number; oy: number } {
  const W = dims.room_width_mm;
  const D = dims.room_depth_mm;
  const scale = Math.min(
    (CANVAS_W - PADDING * 2) / W,
    (CANVAS_H - PADDING * 2) / D,
  );
  const ox = (CANVAS_W - W * scale) / 2;
  const oy = (CANVAS_H - D * scale) / 2;
  return { scale, ox, oy };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoomSetupEditor({ value, onChange }: RoomSetupEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [editingLabel, setEditingLabel] = useState<"width" | "depth" | "height" | "lw" | "ld" | null>(null);
  const [editValue, setEditValue] = useState("");
  const dragStartRef = useRef<{ svgX: number; svgY: number; startDims: RoomDimensions } | null>(null);

  const shape: RoomShape = value.l_width_mm && value.l_depth_mm ? "l-shape" : "rect";
  const { scale, ox, oy } = computeTransform(value);
  const pts = buildPolygon(value, scale, ox, oy);
  const pointsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const W = value.room_width_mm;
  const D = value.room_depth_mm;
  const lw = value.l_width_mm ?? 0;
  const ld = value.l_depth_mm ?? 0;

  // Corner handle positions (in SVG coordinates)
  // Rect corners
  const hTL = { x: ox,             y: oy             }; // origin – display only
  const hTR = { x: W * scale + ox, y: oy             }; // → change width
  const hBL = { x: ox,             y: D * scale + oy }; // → change depth
  const hBR = { x: W * scale + ox, y: D * scale + oy }; // → change width + depth

  // L-shape inner corner (top-right of the step)
  const hLI = { x: (W - lw) * scale + ox, y: ld * scale + oy };

  // Dimension label positions
  const labelWidth = { x: (W / 2) * scale + ox, y: oy - 22 };
  const labelDepth = { x: W * scale + ox + 22,  y: (D / 2) * scale + oy };
  const labelLw    = { x: (W - lw / 2) * scale + ox, y: ld * scale + oy + 22 };
  const labelLd    = { x: (W - lw) * scale + ox - 22, y: (ld / 2) * scale + oy };

  const getSvgXY = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const onHandlePointerDown = (e: React.PointerEvent<SVGCircleElement>, key: HandleKey) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getSvgXY(e);
    dragStartRef.current = { svgX: x, svgY: y, startDims: { ...value } };
    setDragging(key);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !dragStartRef.current) return;
      const { x, y } = getSvgXY(e);
      const dx = (x - dragStartRef.current.svgX) / scale;
      const dy = (y - dragStartRef.current.svgY) / scale;
      const s = dragStartRef.current.startDims;

      if (dragging === "tr") {
        onChange({ ...value, room_width_mm: clampMm(s.room_width_mm + dx) });
      } else if (dragging === "bl") {
        onChange({ ...value, room_depth_mm: clampMm(s.room_depth_mm + dy) });
      } else if (dragging === "br") {
        onChange({
          ...value,
          room_width_mm: clampMm(s.room_width_mm + dx),
          room_depth_mm: clampMm(s.room_depth_mm + dy),
        });
      } else if (dragging === "li") {
        // Inner corner: dragging left decreases l_width, dragging up decreases l_depth
        onChange({
          ...value,
          l_width_mm: clampMm((s.l_width_mm ?? 1000) - dx),
          l_depth_mm: clampMm((s.l_depth_mm ?? 1000) + dy),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, value, onChange, scale],
  );

  const onSvgPointerUp = () => setDragging(null);

  // Inline dimension editing
  const startEdit = (key: typeof editingLabel) => {
    const v =
      key === "width"  ? value.room_width_mm
      : key === "depth"  ? value.room_depth_mm
      : key === "height" ? value.room_height_mm
      : key === "lw"     ? (value.l_width_mm ?? 1000)
      :                    (value.l_depth_mm ?? 1000);
    setEditingLabel(key);
    setEditValue(String(v));
  };

  const commitEdit = useCallback(() => {
    if (!editingLabel) return;
    const mm = parseInt(editValue, 10);
    if (isNaN(mm) || mm < MIN_MM || mm > MAX_MM) { setEditingLabel(null); return; }
    const snapped = Math.round(mm / SNAP_MM) * SNAP_MM;
    if (editingLabel === "width")  onChange({ ...value, room_width_mm: snapped });
    if (editingLabel === "depth")  onChange({ ...value, room_depth_mm: snapped });
    if (editingLabel === "height") onChange({ ...value, room_height_mm: snapped });
    if (editingLabel === "lw")     onChange({ ...value, l_width_mm: snapped });
    if (editingLabel === "ld")     onChange({ ...value, l_depth_mm: snapped });
    setEditingLabel(null);
  }, [editingLabel, editValue, value, onChange]);

  const toggleLShape = () => {
    if (shape === "l-shape") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { l_width_mm, l_depth_mm, ...rest } = value;
      onChange(rest);
    } else {
      onChange({
        ...value,
        l_width_mm: Math.round(value.room_width_mm * 0.4 / SNAP_MM) * SNAP_MM,
        l_depth_mm: Math.round(value.room_depth_mm * 0.4 / SNAP_MM) * SNAP_MM,
      });
    }
  };

  const area = shape === "l-shape"
    ? (W * D - lw * ld) / 1_000_000
    : (W * D) / 1_000_000;

  // ─── Sub-components ──────────────────────────────────────────────────────────

  function DimLabel({
    x, y, mmVal, editKey, anchor = "middle",
  }: {
    x: number; y: number; mmVal: number;
    editKey: typeof editingLabel;
    anchor?: "middle" | "start" | "end";
  }) {
    const isEditing = editingLabel === editKey;
    const lx = anchor === "end" ? x - LABEL_W : anchor === "start" ? x : x - LABEL_W / 2;
    return isEditing ? (
      <foreignObject x={lx} y={y - LABEL_H / 2} width={LABEL_W} height={LABEL_H}>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="number"
          value={editValue}
          min={MIN_MM}
          max={MAX_MM}
          step={SNAP_MM}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingLabel(null);
          }}
          className="w-full h-full text-center text-xs border border-blue-400 rounded px-1 outline-none bg-white text-gray-900"
        />
      </foreignObject>
    ) : (
      <g className="cursor-pointer" onClick={() => startEdit(editKey)}>
        <rect
          x={lx}
          y={y - LABEL_H / 2}
          width={LABEL_W}
          height={LABEL_H}
          rx={5}
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
        <text
          x={lx + LABEL_W / 2}
          y={y + 5}
          textAnchor="middle"
          fontSize="11"
          fill="#374151"
        >
          {fmtMm(mmVal)}
        </text>
      </g>
    );
  }

  function CornerHandle({
    cx, cy, hKey, cursor,
  }: {
    cx: number; cy: number; hKey: HandleKey; cursor: string;
  }) {
    const active = dragging === hKey;
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={HANDLE_R + 6}
          fill="transparent"
          style={{ cursor }}
          onPointerDown={(e) => onHandlePointerDown(e, hKey)}
        />
        <circle
          cx={cx}
          cy={cy}
          r={HANDLE_R}
          fill={active ? "#2563eb" : "white"}
          stroke={active ? "#1d4ed8" : "#3b82f6"}
          strokeWidth="2"
          style={{ cursor, pointerEvents: "none" }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={3}
          fill={active ? "white" : "#3b82f6"}
          style={{ pointerEvents: "none" }}
        />
      </g>
    );
  }

  // Fixed origin marker
  function OriginMarker({ cx, cy }: { cx: number; cy: number }) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={HANDLE_R} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={3} fill="#9ca3af" />
      </g>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Shape toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">방 형태:</span>
        <button
          type="button"
          onClick={() => shape === "rect" ? null : toggleLShape()}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
            shape === "rect"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}
        >
          직사각형
        </button>
        <button
          type="button"
          onClick={() => shape === "l-shape" ? null : toggleLShape()}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
            shape === "l-shape"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}
        >
          L자형
        </button>
      </div>

      {/* SVG canvas */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="touch-none select-none"
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          <defs>
            <pattern id="rse-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#f0f0f0" strokeWidth="0.5" />
            </pattern>
            <pattern id="rse-dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="0.8" fill="#e5e7eb" />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#rse-dots)" />
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#rse-grid)" opacity="0.6" />

          {/* Room fill */}
          <polygon
            points={pointsStr}
            fill="rgba(59,130,246,0.07)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Corner crosshair guides when dragging */}
          {dragging === "br" && (
            <>
              <line x1={hBR.x} y1={oy} x2={hBR.x} y2={hBR.y} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
              <line x1={ox}   y1={hBR.y} x2={hBR.x} y2={hBR.y} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
            </>
          )}
          {dragging === "tr" && (
            <line x1={hTR.x} y1={oy} x2={hTR.x} y2={D * scale + oy} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
          )}
          {dragging === "bl" && (
            <line x1={ox} y1={hBL.y} x2={W * scale + ox} y2={hBL.y} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
          )}
          {dragging === "li" && (
            <>
              <line x1={hLI.x} y1={oy} x2={hLI.x} y2={hLI.y} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
              <line x1={ox}    y1={hLI.y} x2={hLI.x} y2={hLI.y} stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 3" />
            </>
          )}

          {/* Dimension labels */}
          {/* Width — top edge */}
          <DimLabel x={labelWidth.x} y={labelWidth.y} mmVal={W} editKey="width" />
          {/* Depth — right edge */}
          <DimLabel x={labelDepth.x} y={labelDepth.y} mmVal={D} editKey="depth" anchor="start" />

          {/* L-shape labels */}
          {shape === "l-shape" && lw > 0 && ld > 0 && (
            <>
              <DimLabel x={labelLw.x} y={labelLw.y} mmVal={lw} editKey="lw" />
              <DimLabel x={labelLd.x} y={labelLd.y} mmVal={ld} editKey="ld" anchor="end" />
            </>
          )}

          {/* ── Corner handles ─────────────────────────────────────────────── */}

          {/* TL – fixed origin */}
          <OriginMarker cx={hTL.x} cy={hTL.y} />

          {/* TR – drag to change width */}
          <CornerHandle cx={hTR.x} cy={hTR.y} hKey="tr" cursor="ew-resize" />

          {/* BL – drag to change depth */}
          <CornerHandle cx={hBL.x} cy={hBL.y} hKey="bl" cursor="ns-resize" />

          {/* BR – drag to change width + depth simultaneously */}
          <CornerHandle cx={hBR.x} cy={hBR.y} hKey="br" cursor="nwse-resize" />

          {/* L-shape inner corner */}
          {shape === "l-shape" && lw > 0 && ld > 0 && (
            <CornerHandle cx={hLI.x} cy={hLI.y} hKey="li" cursor="move" />
          )}

          {/* Legend */}
          <text x={CANVAS_W / 2} y={CANVAS_H - 10} textAnchor="middle" fontSize="10" fill="#9ca3af">
            코너 드래그 → 크기 조절 · 치수 레이블 클릭 → 직접 입력
          </text>
        </svg>
      </div>

      {/* Stats row + height field */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <span>
          면적 <strong className="text-gray-900">{area.toFixed(2)} m²</strong>
        </span>
        <span className="hidden h-4 w-px bg-gray-200 sm:block" />
        <span className="flex items-center gap-2">
          천장 높이:
          {editingLabel === "height" ? (
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="number"
              value={editValue}
              min={2000}
              max={4000}
              step={100}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditingLabel(null);
              }}
              className="w-24 rounded border border-blue-400 bg-white px-1 py-0.5 text-xs text-gray-900 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => startEdit("height")}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium transition-colors hover:border-gray-400"
            >
              {fmtMm(value.room_height_mm)}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
