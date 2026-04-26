/**
 * Regression for DPR-124: placement click → setSelectedId regression.
 *
 * Root cause: onItemPointerDown called e.preventDefault() which cancels the
 * synthetic click event on desktop browsers, making suppressNextClick unreliable.
 * Additionally setSelectedId was called AFTER placements.find, so if the find
 * threw (undefined p for a newly-added item) selection was silently lost.
 *
 * These tests use a minimal SVG-based component that mirrors the actual
 * pointer-event flow to verify:
 *   1. Clicking a placement sets selectedId immediately.
 *   2. Clicking a newly-added placement (simulating confirmPlacement) sets selectedId.
 *   3. Clicking the SVG background after a placement click does NOT deselect
 *      (suppressNextClick absorbs that click).
 *   4. A second background click DOES deselect.
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
  const suppressNextClick = useRef(false);

  const onItemPointerDown = (e: React.PointerEvent, placementId: string) => {
    e.stopPropagation();
    // FIX: set selection + suppressNextClick BEFORE placements.find
    setSelectedId(placementId);
    suppressNextClick.current = true;

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
    suppressNextClick.current = true;
  }, []);

  const onSvgClick = () => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    setSelectedId(null);
  };

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
        onClick={onSvgClick}
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
            onClick={(e) => e.stopPropagation()}
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

describe("placement click → setSelectedId (DPR-124 regression)", () => {
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

    // Add new placement (simulates confirmPlacement adding to state)
    fireEvent.click(screen.getByTestId("add-btn"));

    // Newly added placement must be in DOM
    expect(screen.getByTestId("placement-p-new")).toBeInTheDocument();

    // Click on newly added placement
    fireEvent.pointerDown(screen.getByTestId("placement-p-new"), {
      pointerId: 1,
    });

    expect(screen.getByTestId("selected")).toHaveTextContent("p-new");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("SVG background click after placement click suppresses deselect once (suppressNextClick)", () => {
    render(<PlacementCanvas />);

    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    // Simulate the synthesized SVG click that follows pointerup (via pointer capture)
    fireEvent.click(screen.getByTestId("canvas"));
    // suppressNextClick should absorb this — item stays selected
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    // A second background click should now deselect
    fireEvent.click(screen.getByTestId("canvas"));
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
    expect(screen.queryByTestId("action-bar")).not.toBeInTheDocument();
  });

  it("switching selection between two placements works without stale suppressNextClick", () => {
    render(<PlacementCanvas />);
    fireEvent.click(screen.getByTestId("add-btn"));

    // Select first placement
    fireEvent.pointerDown(screen.getByTestId("placement-p-initial"), {
      pointerId: 1,
    });
    // Consume suppressNextClick (simulates the pointer-capture SVG click)
    fireEvent.click(screen.getByTestId("canvas"));
    expect(screen.getByTestId("selected")).toHaveTextContent("p-initial");

    // Select newly added placement
    fireEvent.pointerDown(screen.getByTestId("placement-p-new"), {
      pointerId: 2,
    });
    expect(screen.getByTestId("selected")).toHaveTextContent("p-new");
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });
});
