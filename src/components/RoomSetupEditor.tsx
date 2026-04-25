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
const PADDING = 64;
const SNAP_MM = 50;
const MIN_MM = 500;
const MAX_MM = 20000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampMm(v: number): number {
  return Math.max(MIN_MM, Math.min(MAX_MM, Math.round(v / SNAP_MM) * SNAP_MM));
}

function fmtMm(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)}m` : `${mm}mm`;
}

/** Build SVG polygon points for the room outline */
function buildPolygon(
  dims: RoomDimensions,
  scale: number,
  ox: number,
  oy: number
): { x: number; y: number }[] {
  const { room_width_mm: W, room_depth_mm: D, l_width_mm: lw, l_depth_mm: ld } = dims;

  if (lw && ld) {
    // L-shape: full rect with top-right corner cut out
    // (0,0)→(W,0)→(W,ld)→(W-lw,ld)→(W-lw,D)→(0,D)
    return [
      { x: 0,      y: 0  },
      { x: W,      y: 0  },
      { x: W,      y: ld },
      { x: W - lw, y: ld },
      { x: W - lw, y: D  },
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
    (CANVAS_H - PADDING * 2) / D
  );
  const ox = (CANVAS_W - W * scale) / 2;
  const oy = (CANVAS_H - D * scale) / 2;
  return { scale, ox, oy };
}

// ─── Drag-handle types ────────────────────────────────────────────────────────

type HandleKey = "right" | "bottom" | "l-inner-x" | "l-inner-y";

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoomSetupEditor({ value, onChange }: RoomSetupEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [editingLabel, setEditingLabel] = useState<HandleKey | "height" | null>(null);
  const [editValue, setEditValue] = useState("");
  const dragStartRef = useRef<{ svgX: number; svgY: number; startDims: RoomDimensions } | null>(null);

  const shape: RoomShape = value.l_width_mm && value.l_depth_mm ? "l-shape" : "rect";
  const { scale, ox, oy } = computeTransform(value);
  const pts = buildPolygon(value, scale, ox, oy);
  const pointsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

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
      const start = dragStartRef.current.startDims;

      if (dragging === "right") {
        onChange({ ...value, room_width_mm: clampMm(start.room_width_mm + dx) });
      } else if (dragging === "bottom") {
        onChange({ ...value, room_depth_mm: clampMm(start.room_depth_mm + dy) });
      } else if (dragging === "l-inner-x") {
        onChange({ ...value, l_width_mm: clampMm(start.l_width_mm! + dx) });
      } else if (dragging === "l-inner-y") {
        onChange({ ...value, l_depth_mm: clampMm(start.l_depth_mm! + dy) });
      }
    },
    [dragging, value, onChange, scale]
  );

  const onSvgPointerUp = () => setDragging(null);

  const startEdit = (key: HandleKey | "height") => {
    const v =
      key === "right" ? value.room_width_mm
      : key === "bottom" ? value.room_depth_mm
      : key === "height" ? value.room_height_mm
      : key === "l-inner-x" ? (value.l_width_mm ?? 1000)
      : (value.l_depth_mm ?? 1000);
    setEditingLabel(key);
    setEditValue(String(v));
  };

  const commitEdit = useCallback(() => {
    if (!editingLabel) return;
    const mm = parseInt(editValue, 10);
    if (isNaN(mm) || mm < MIN_MM || mm > MAX_MM) {
      setEditingLabel(null);
      return;
    }
    const snapped = Math.round(mm / SNAP_MM) * SNAP_MM;
    if (editingLabel === "right")    onChange({ ...value, room_width_mm: snapped });
    if (editingLabel === "bottom")   onChange({ ...value, room_depth_mm: snapped });
    if (editingLabel === "height")   onChange({ ...value, room_height_mm: snapped });
    if (editingLabel === "l-inner-x") onChange({ ...value, l_width_mm: snapped });
    if (editingLabel === "l-inner-y") onChange({ ...value, l_depth_mm: snapped });
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

  // Handle positions
  const W = value.room_width_mm;
  const D = value.room_depth_mm;
  const lw = value.l_width_mm ?? 0;
  const ld = value.l_depth_mm ?? 0;

  const rightHandle = { x: W * scale + ox, y: (D / 2) * scale + oy };
  const bottomHandle = { x: (W / 2) * scale + ox, y: D * scale + oy };
  // L-shape inner corner handles
  const lInnerXHandle = { x: (W - lw / 2) * scale + ox, y: ld * scale + oy };
  const lInnerYHandle = { x: (W - lw) * scale + ox, y: (ld / 2) * scale + oy };

  // Dimension label positions (midpoints of relevant edges, offset outward)
  const widthLabel  = { x: (W / 2) * scale + ox, y: -16 + oy };
  const depthLabel  = { x: W * scale + ox + 18, y: (D / 2) * scale + oy };
  const lwLabel     = { x: (W - lw / 2) * scale + ox, y: ld * scale + oy + 18 };
  const ldLabel     = { x: W * scale + ox + 18, y: (ld / 2) * scale + oy };

  const HANDLE_R = 7;
  const LABEL_W = 68;
  const LABEL_H = 22;

  function DimLabel({ x, y, mmVal, editKey }: { x: number; y: number; mmVal: number; editKey: HandleKey }) {
    const isEditing = editingLabel === editKey;
    return isEditing ? (
      <foreignObject x={x - 36} y={y - 12} width={72} height={24}>
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
        <rect x={x - LABEL_W / 2} y={y - LABEL_H / 2} width={LABEL_W} height={LABEL_H} rx={5} fill="white" stroke="#e5e7eb" strokeWidth="1" />
        <text x={x} y={y + 5} textAnchor="middle" fontSize="11" fill="#374151">{fmtMm(mmVal)}</text>
      </g>
    );
  }

  const area = shape === "l-shape"
    ? (W * D - lw * ld) / 1_000_000
    : (W * D) / 1_000_000;

  return (
    <div className="flex flex-col gap-4">
      {/* Shape toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">방 형태:</span>
        <button
          type="button"
          onClick={toggleLShape}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${shape === "rect" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
        >
          직사각형
        </button>
        <button
          type="button"
          onClick={toggleLShape}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${shape === "l-shape" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
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
            <pattern id="rse-dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="0.9" fill="#e5e7eb" />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#rse-dots)" />

          {/* Room fill */}
          <polygon
            points={pointsStr}
            fill="rgba(59,130,246,0.07)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Width label (top edge) */}
          <DimLabel x={widthLabel.x} y={widthLabel.y} mmVal={W} editKey="right" />

          {/* Depth label (right edge) */}
          <DimLabel x={depthLabel.x} y={depthLabel.y} mmVal={D} editKey="bottom" />

          {/* L-shape labels */}
          {shape === "l-shape" && lw > 0 && ld > 0 && (
            <>
              <DimLabel x={lwLabel.x} y={lwLabel.y} mmVal={lw} editKey="l-inner-x" />
              <DimLabel x={ldLabel.x} y={ldLabel.y} mmVal={ld} editKey="l-inner-y" />
            </>
          )}

          {/* Drag handles */}
          {/* Right (width) */}
          <circle
            cx={rightHandle.x}
            cy={rightHandle.y}
            r={HANDLE_R}
            fill={dragging === "right" ? "#2563eb" : "white"}
            stroke={dragging === "right" ? "#1d4ed8" : "#3b82f6"}
            strokeWidth="2"
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => onHandlePointerDown(e, "right")}
          />
          <text x={rightHandle.x} y={rightHandle.y + 4.5} textAnchor="middle" fontSize="9" fill={dragging === "right" ? "white" : "#3b82f6"} className="pointer-events-none">↔</text>

          {/* Bottom (depth) */}
          <circle
            cx={bottomHandle.x}
            cy={bottomHandle.y}
            r={HANDLE_R}
            fill={dragging === "bottom" ? "#2563eb" : "white"}
            stroke={dragging === "bottom" ? "#1d4ed8" : "#3b82f6"}
            strokeWidth="2"
            style={{ cursor: "ns-resize" }}
            onPointerDown={(e) => onHandlePointerDown(e, "bottom")}
          />
          <text x={bottomHandle.x} y={bottomHandle.y + 4.5} textAnchor="middle" fontSize="9" fill={dragging === "bottom" ? "white" : "#3b82f6"} className="pointer-events-none">↕</text>

          {/* L-shape inner handles */}
          {shape === "l-shape" && lw > 0 && ld > 0 && (
            <>
              <circle
                cx={lInnerXHandle.x}
                cy={lInnerXHandle.y}
                r={HANDLE_R}
                fill={dragging === "l-inner-x" ? "#2563eb" : "white"}
                stroke={dragging === "l-inner-x" ? "#1d4ed8" : "#3b82f6"}
                strokeWidth="2"
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onHandlePointerDown(e, "l-inner-x")}
              />
              <text x={lInnerXHandle.x} y={lInnerXHandle.y + 4.5} textAnchor="middle" fontSize="9" fill={dragging === "l-inner-x" ? "white" : "#3b82f6"} className="pointer-events-none">↔</text>
              <circle
                cx={lInnerYHandle.x}
                cy={lInnerYHandle.y}
                r={HANDLE_R}
                fill={dragging === "l-inner-y" ? "#2563eb" : "white"}
                stroke={dragging === "l-inner-y" ? "#1d4ed8" : "#3b82f6"}
                strokeWidth="2"
                style={{ cursor: "ns-resize" }}
                onPointerDown={(e) => onHandlePointerDown(e, "l-inner-y")}
              />
              <text x={lInnerYHandle.x} y={lInnerYHandle.y + 4.5} textAnchor="middle" fontSize="9" fill={dragging === "l-inner-y" ? "white" : "#3b82f6"} className="pointer-events-none">↕</text>
            </>
          )}
        </svg>
      </div>

      {/* Stats row + height field */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <span>
          면적 <strong className="text-gray-900">{area.toFixed(2)} m²</strong>
        </span>
        <span className="hidden sm:block h-4 w-px bg-gray-200" />
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
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingLabel(null); }}
              className="w-24 text-xs border border-blue-400 rounded px-1 py-0.5 outline-none bg-white text-gray-900"
            />
          ) : (
            <button
              type="button"
              onClick={() => startEdit("height")}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium hover:border-gray-400 transition-colors"
            >
              {fmtMm(value.room_height_mm)}
            </button>
          )}
        </span>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">
          치수 레이블 클릭 → 직접 입력 · 핸들 드래그 → 크기 조절
        </span>
      </div>
    </div>
  );
}
