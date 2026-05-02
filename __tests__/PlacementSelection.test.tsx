/**
 * Regression for DPR-124 / DPR-178: placement click → setSelectedId.
 *
 * DPR-124 root cause: e.preventDefault() on pointerdown cancelled the
 * synthesized click, and setSelectedId was called after placements.find so
 * newly-added items silently lost selection.
 *
 * DPR-178 root cause: the suppressNextClick ref mechanism is unreliable on
 * mobile — whether the post-tap click fires on the <g> (stopPropagation'd) or
 * the SVG (pointer-capture) is browser-specific. iOS Safari doesn't guarantee
 * the click follows pointer capture, so the flag could be left unconsumed and
 * the next background tap would incorrectly skip deselect, OR the flag was
 * never consumed and a second synthesized click fired on SVG with the flag
 * already false, immediately deselecting the item.
 *
 * Fix: replaced onClick deselect on SVG with onPointerDown. The placement <g>
 * already calls e.stopPropagation() on pointerdown, so the SVG onPointerDown
 * never fires for placement taps — no flag needed, no race condition.
 *
 * These tests verify:
 *   1. Clicking a placement sets selectedId immediately.
 *   2. Clicking a newly-added placement sets selectedId.
 *   3. pointerDown on the SVG background deselects.
 *   4. Switching selection between two placements works.
 */

import React, { useState, useRef, useCallback } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Minimal component mirroring FurniturePlacer's pointer-event flow ──────────

interface Placement {
  id: string;
  x: number;
  y: number;
}

function PlacementCanvas() {
  const [placements, setPlacements] = useState<Placement[]>([
    { id: "p-initial", x: 10, y: 10 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ placementId: string; hasMoved: boolean } | null>(null);

  const onItemPointerDown = (e: React.PointerEvent, placementId: string) => {
    e.stopPropagation();
    setSelectedId(placementId);

    const p = placements.find((pl) => pl.id === placementId);
    if (!p) {
      svgRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }
    dragRef.current = { placementId, hasMoved: false };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onSvgPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
  }, []);

  const addPlacement = (id: string) => {
    setPlacements((prev) => [...prev, { id, x: 50, y: 50 }]);
  };

  return (
    <div>
      <button data-testid="add-btn" onClick={() => addPlacement("p-new")}>
        추가
      </button>
      <div data-testid="selected">{selectedId ?? "none"}</div>
      <svg
        ref={svgRef}
        data-testid="canvas"
        onPointerUp={onSvgPointerUp}
        onPointerDown={() => setSelectedId(null)}
      >
        {placements.map((p) => (
          <rect
            key={p.id}
            data-testid={`placement-${p.id}`}
            x={p.x}
            y={p.y}
            width={20}
            height={20}
            onPointerDown={(e) => onItemPointerDown(e, p.id)}
          />
        ))}
      </svg>
      {selectedId && (
        <div data-testid="action-bar">
          <button data-testid="rotate-btn">↻ 회전</button>
          <button data-testid="delete-btn">삭제</button>
        </div>
      )}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("placement click → setSelectedId (DPR-124 / DPR-178 regression)", () => {
  it("clicking a pre-existing placement selects it and shows action bar", () => {
    render(<PlacementCanvas />);
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });

    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
    expect(screen.getByTestId("rotate-btn")).toBeInTheDocument();
  });

  it("clicking a newly-added placement immediately selects it", () => {
    render(<PlacementCanvas />);

    fireEvent.click(screen.getByTestId("add-btn"));

    expect(screen.getByTestId("placement-p-new")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("placement-p-new"), {
      pointerId: 1,
    });

    expect(screen.getByTestId("selected")).toHaveTextContent("p-new");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("pointerDown on SVG background deselects the selected item", () => {
    render(<PlacementCanvas />);

    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    // Background tap (pointerDown on SVG canvas, not a placement)
    fireEvent.pointerDown(screen.getByTestId("canvas"), { pointerId: 2 });
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("placement pointerDown stops propagation — SVG background handler does not fire", () => {
    render(<PlacementCanvas />);

    // Select p-initial
    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    // Tapping p-initial again should NOT deselect (stopPropagation prevents SVG handler)
    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 2,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("switching selection between two placements works", () => {
    render(<PlacementCanvas />);
    fireEvent.click(screen.getByTestId("add-btn"));

    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    fireEvent.pointerDown(screen.getByTestId("placement-p-new"), {
      pointerId: 2,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-new");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });
});
