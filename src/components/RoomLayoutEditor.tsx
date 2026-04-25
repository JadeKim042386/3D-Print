"use client";

import { useState, useRef, useCallback } from "react";

export interface RoomPoint {
  x: number; // mm
  y: number; // mm
}

export interface RoomLayoutEditorProps {
  initialCorners?: RoomPoint[];
  onChange?: (corners: RoomPoint[]) => void;
}

// Default room: 3600 × 4800mm (standard Korean living room)
const DEFAULT_CORNERS: RoomPoint[] = [
  { x: 0, y: 0 },
  { x: 3600, y: 0 },
  { x: 3600, y: 4800 },
  { x: 0, y: 4800 },
];

const CANVAS_W = 600;
const CANVAS_H = 520;
const PADDING = 70; // px
const SNAP_MM = 50; // snap to 50mm grid

function dist(a: RoomPoint, b: RoomPoint) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midpt(a: RoomPoint, b: RoomPoint): RoomPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function computeScale(corners: RoomPoint[]): { scale: number; ox: number; oy: number } {
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

export default function RoomLayoutEditor({
  initialCorners,
  onChange,
}: RoomLayoutEditorProps) {
  const baseCorners = initialCorners ?? DEFAULT_CORNERS;
  const [corners, setCorners] = useState<RoomPoint[]>(baseCorners);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editingEdge, setEditingEdge] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);

  const { scale, ox, oy } = computeScale(corners);

  const toSvg = (pt: RoomPoint) => ({
    x: pt.x * scale + ox,
    y: pt.y * scale + oy,
  });

  const toMm = (svgX: number, svgY: number): RoomPoint => ({
    x: Math.round(((svgX - ox) / scale / SNAP_MM)) * SNAP_MM,
    y: Math.round(((svgY - oy) / scale / SNAP_MM)) * SNAP_MM,
  });

  const getSvgXY = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const onCornerPointerDown = (e: React.PointerEvent<SVGCircleElement>, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingIdx(idx);
    (e.currentTarget as Element).closest("svg")?.setPointerCapture?.(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingIdx === null) return;
    const { x, y } = getSvgXY(e);
    const mm = toMm(x, y);
    const next = corners.map((c, i) => (i === draggingIdx ? mm : c));
    setCorners(next);
    onChange?.(next);
  };

  const onSvgPointerUp = () => setDraggingIdx(null);

  const addCornerAtEdge = (edgeIdx: number) => {
    const p1 = corners[edgeIdx];
    const p2 = corners[(edgeIdx + 1) % corners.length];
    const mid = midpt(p1, p2);
    const next = [...corners.slice(0, edgeIdx + 1), mid, ...corners.slice(edgeIdx + 1)];
    setCorners(next);
    onChange?.(next);
  };

  const removeCorner = (idx: number) => {
    if (corners.length <= 3) return;
    const next = corners.filter((_, i) => i !== idx);
    setCorners(next);
    onChange?.(next);
  };

  const startEditEdge = (edgeIdx: number) => {
    const p1 = corners[edgeIdx];
    const p2 = corners[(edgeIdx + 1) % corners.length];
    setEditingEdge(edgeIdx);
    setEditValue(String(Math.round(dist(p1, p2))));
  };

  const commitEdgeEdit = useCallback(() => {
    if (editingEdge === null) return;
    const len = parseInt(editValue, 10);
    if (isNaN(len) || len < 100 || len > 50000) {
      setEditingEdge(null);
      return;
    }
    const p1 = corners[editingEdge];
    const p2 = corners[(editingEdge + 1) % corners.length];
    const cur = dist(p1, p2);
    if (cur === 0) { setEditingEdge(null); return; }
    const ratio = len / cur;
    const dx = Math.round((p2.x - p1.x) * ratio - (p2.x - p1.x));
    const dy = Math.round((p2.y - p1.y) * ratio - (p2.y - p1.y));
    // Shift all corners after edgeIdx by delta
    const next = corners.map((c, i) =>
      i > editingEdge ? { x: c.x + dx, y: c.y + dy } : c
    );
    setCorners(next);
    onChange?.(next);
    setEditingEdge(null);
  }, [editingEdge, editValue, corners, onChange]);

  const svgCorners = corners.map(toSvg);
  const pointsStr = svgCorners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Compute room area in m²
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    area += corners[i].x * corners[j].y;
    area -= corners[j].x * corners[i].y;
  }
  area = Math.abs(area) / 2 / 1_000_000; // mm² → m²

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="touch-none select-none cursor-crosshair"
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          {/* Dot grid */}
          <defs>
            <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="0.9" fill="#e5e7eb" />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dots)" />

          {/* Room fill */}
          <polygon
            points={pointsStr}
            fill="rgba(59,130,246,0.07)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Edge labels and midpoint add-handles */}
          {corners.map((c, i) => {
            const next = corners[(i + 1) % corners.length];
            const sc = svgCorners[i];
            const sn = svgCorners[(i + 1) % corners.length];
            const mid = { x: (sc.x + sn.x) / 2, y: (sc.y + sn.y) / 2 };
            const edgeLen = Math.round(dist(c, next));

            // Normal offset for label (outward from polygon)
            const edgeDx = sn.x - sc.x;
            const edgeDy = sn.y - sc.y;
            const edgeMag = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
            const nx = (-edgeDy / edgeMag) * 26;
            const ny = (edgeDx / edgeMag) * 26;
            const lx = mid.x + nx;
            const ly = mid.y + ny;

            const isEditing = editingEdge === i;

            return (
              <g key={i}>
                {/* Midpoint add-corner button */}
                <circle
                  cx={mid.x}
                  cy={mid.y}
                  r={7}
                  fill="white"
                  stroke="#d1d5db"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:stroke-blue-400 hover:fill-blue-50"
                  onClick={() => addCornerAtEdge(i)}
                />
                <text
                  x={mid.x}
                  y={mid.y + 4.5}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#9ca3af"
                  className="pointer-events-none"
                >
                  +
                </text>

                {/* Dimension label */}
                {isEditing ? (
                  <foreignObject x={lx - 38} y={ly - 14} width={76} height={28}>
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      type="number"
                      min={100}
                      max={50000}
                      step={50}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdgeEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdgeEdit();
                        if (e.key === "Escape") setEditingEdge(null);
                      }}
                      className="w-full h-full text-center text-xs border border-blue-400 rounded px-1 outline-none bg-white text-gray-900"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    />
                  </foreignObject>
                ) : (
                  <g className="cursor-pointer" onClick={() => startEditEdge(i)}>
                    <rect
                      x={lx - 32}
                      y={ly - 12}
                      width={64}
                      height={24}
                      rx={5}
                      fill="white"
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    <text
                      x={lx}
                      y={ly + 5}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="'Noto Sans KR', monospace"
                      fill="#374151"
                    >
                      {edgeLen >= 1000
                        ? `${(edgeLen / 1000).toFixed(2)}m`
                        : `${edgeLen}mm`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Corner drag handles */}
          {svgCorners.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={draggingIdx === i ? 10 : 8}
                fill="white"
                stroke={draggingIdx === i ? "#1d4ed8" : "#3b82f6"}
                strokeWidth="2.5"
                style={{ cursor: draggingIdx === i ? "grabbing" : "grab" }}
                onPointerDown={(e) => onCornerPointerDown(e, i)}
                onDoubleClick={() => removeCorner(i)}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={3.5}
                fill={draggingIdx === i ? "#1d4ed8" : "#3b82f6"}
                className="pointer-events-none"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
        <span>
          <span className="font-semibold text-gray-900">{corners.length}</span>개 꼭짓점
        </span>
        <span>
          면적{" "}
          <span className="font-semibold text-gray-900">{area.toFixed(2)}</span> m²
        </span>
        <span className="text-xs text-gray-400">꼭짓점 더블클릭 → 삭제</span>
      </div>
    </div>
  );
}
