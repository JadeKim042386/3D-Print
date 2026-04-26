import { describe, it, expect } from "vitest";
import { autoPlace, normalizeFurnitureCategory } from "../lib/auto-placement/index.js";
import {
  obbInsidePolygon,
  obbOverlap,
  obbCorners,
  makeFurnitureObb,
  ensureCcw,
  polygonCentroid,
  distancePointToPolygonEdge,
} from "../lib/auto-placement/geometry.js";

const rectRoom = (w: number, d: number) =>
  ensureCcw([
    { x_mm: 0, y_mm: 0 },
    { x_mm: w, y_mm: 0 },
    { x_mm: w, y_mm: d },
    { x_mm: 0, y_mm: d },
  ]);

// L-shaped room (mm). 4000x4000 with a 1500x1500 notch in the top-right corner.
const lShapedRoom = () =>
  ensureCcw([
    { x_mm: 0, y_mm: 0 },
    { x_mm: 4000, y_mm: 0 },
    { x_mm: 4000, y_mm: 2500 },
    { x_mm: 2500, y_mm: 2500 },
    { x_mm: 2500, y_mm: 4000 },
    { x_mm: 0, y_mm: 4000 },
  ]);

describe("auto-placement v1 — sanity", () => {
  it("places a bed in an empty rectangular bedroom flush to a wall", () => {
    const result = autoPlace({
      roomPolygon: rectRoom(3500, 4000),
      existing: [],
      candidate: { width_mm: 1600, depth_mm: 2000, height_mm: 700, category: "침대" },
    });
    expect(result.best).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0.5);

    // Inside the room
    const obb = makeFurnitureObb(
      result.best!.x_mm,
      result.best!.y_mm,
      result.best!.rotation_deg,
      1600,
      2000,
    );
    expect(obbInsidePolygon(obb, rectRoom(3500, 4000))).toBe(true);

    // Wall-aligned: minimal distance from centre to one wall ≈ depth/2.
    const cx = result.best!.x_mm;
    const cy = result.best!.y_mm;
    const distLeft = cx;
    const distRight = 3500 - cx;
    const distBottom = cy;
    const distTop = 4000 - cy;
    const halfW = 800; // depending on rotation
    const halfD = 1000;
    const minWallDist = Math.min(distLeft, distRight, distBottom, distTop);
    expect(minWallDist).toBeLessThanOrEqual(Math.max(halfW, halfD) + 50);
  });

  it("returns alternatives + best, with reasons populated", () => {
    const result = autoPlace({
      roomPolygon: rectRoom(4000, 5000),
      existing: [],
      candidate: { width_mm: 2200, depth_mm: 900, height_mm: 850, category: "소파" },
      k: 3,
    });
    expect(result.best).not.toBeNull();
    expect(result.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(result.alternatives.length).toBeLessThanOrEqual(2);
    expect(result.best!.reasons.length).toBeGreaterThan(0);
    // Sorted descending
    expect(result.best!.score).toBeGreaterThanOrEqual(result.alternatives[0]!.score);
  });
});

describe("auto-placement v1 — collisions and clearance", () => {
  it("rejects positions that overlap existing furniture", () => {
    // 4x5 m room, blocked by a 3.6 m wide wardrobe along the left wall.
    const result = autoPlace({
      roomPolygon: rectRoom(4000, 5000),
      existing: [
        {
          x_mm: 300,
          y_mm: 2500,
          rotation_deg: 90,
          width_mm: 3600,
          depth_mm: 600,
          category: "수납장",
        },
      ],
      candidate: { width_mm: 1500, depth_mm: 2000, height_mm: 700, category: "침대" },
    });
    expect(result.best).not.toBeNull();
    const bedObb = makeFurnitureObb(
      result.best!.x_mm,
      result.best!.y_mm,
      result.best!.rotation_deg,
      1500,
      2000,
    );
    const wardrobeObb = makeFurnitureObb(300, 2500, 90, 3600, 600);
    expect(obbOverlap(bedObb, wardrobeObb)).toBe(false);
  });

  it("returns no placement when oversized furniture cannot fit", () => {
    const result = autoPlace({
      roomPolygon: rectRoom(2000, 2000),
      existing: [],
      candidate: { width_mm: 3000, depth_mm: 1000, height_mm: 850, category: "소파" },
    });
    expect(result.best).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns no placement in a fully cluttered room", () => {
    // Tile a 3x3 m room with five 1.2 m chunks; nothing left for a desk.
    const room = rectRoom(3000, 3000);
    const existing = [
      { x_mm: 600, y_mm: 600, rotation_deg: 0, width_mm: 1200, depth_mm: 1200, category: "수납장" as const },
      { x_mm: 2400, y_mm: 600, rotation_deg: 0, width_mm: 1200, depth_mm: 1200, category: "수납장" as const },
      { x_mm: 600, y_mm: 2400, rotation_deg: 0, width_mm: 1200, depth_mm: 1200, category: "수납장" as const },
      { x_mm: 2400, y_mm: 2400, rotation_deg: 0, width_mm: 1200, depth_mm: 1200, category: "수납장" as const },
      { x_mm: 1500, y_mm: 1500, rotation_deg: 0, width_mm: 1500, depth_mm: 1500, category: "수납장" as const },
    ];
    const result = autoPlace({
      roomPolygon: room,
      existing,
      candidate: { width_mm: 1400, depth_mm: 700, height_mm: 750, category: "책상" },
    });
    expect(result.best).toBeNull();
  });
});

describe("auto-placement v1 — category-specific behaviour", () => {
  it("places a TV stand against a wall in a living room", () => {
    const result = autoPlace({
      roomPolygon: rectRoom(5000, 4000),
      existing: [],
      candidate: { width_mm: 1800, depth_mm: 450, height_mm: 500, category: "TV장" },
    });
    expect(result.best).not.toBeNull();
    // Wall-aligned reason should be present.
    expect(result.best!.reasons).toContain("wall-aligned");
  });

  it("places a sofa near an existing TV stand (pairing bonus)", () => {
    const room = rectRoom(5000, 4000);
    const existing = [
      // TV stand against the bottom wall, centred horizontally.
      {
        x_mm: 2500,
        y_mm: 225,
        rotation_deg: 0,
        width_mm: 1800,
        depth_mm: 450,
        category: "TV장" as const,
      },
    ];
    const result = autoPlace({
      roomPolygon: room,
      existing,
      candidate: { width_mm: 2200, depth_mm: 900, height_mm: 850, category: "소파" },
    });
    expect(result.best).not.toBeNull();
    // Sofa should sit on the OPPOSITE wall (top), facing the TV.
    expect(result.best!.y_mm).toBeGreaterThan(2000);
  });

  it("biases a dining table toward the room centroid", () => {
    const room = rectRoom(4000, 4000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1400, depth_mm: 800, height_mm: 750, category: "식탁/의자" },
    });
    expect(result.best).not.toBeNull();
    const c = polygonCentroid(room);
    const d = Math.hypot(result.best!.x_mm - c.x_mm, result.best!.y_mm - c.y_mm);
    // Should be within roughly a third of the room diagonal of the centre.
    expect(d).toBeLessThan(2000);
  });
});

describe("auto-placement v1.1 — clearance_mm hard constraint", () => {
  it("keeps every corner ≥ clearance_mm from walls for non-wall-aligned categories", () => {
    const room = rectRoom(4000, 4000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      // 식탁/의자 has wallAlign:false, so clearance is enforced on all corners.
      candidate: { width_mm: 1400, depth_mm: 800, height_mm: 750, category: "식탁/의자" },
      clearanceMm: 100,
    });
    expect(result.best).not.toBeNull();
    const corners = obbCorners(
      makeFurnitureObb(
        result.best!.x_mm,
        result.best!.y_mm,
        result.best!.rotation_deg,
        1400,
        800,
      ),
    );
    for (const c of corners) {
      // Allow 0.01 mm of float-noise tolerance.
      expect(distancePointToPolygonEdge(c, room)).toBeGreaterThanOrEqual(100 - 0.01);
    }
  });

  it("allows back corners flush against the wall but enforces front clearance for wall-aligned categories", () => {
    const room = rectRoom(4000, 5000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1500, depth_mm: 2000, height_mm: 700, category: "침대" },
      clearanceMm: 100,
    });
    expect(result.best).not.toBeNull();
    const corners = obbCorners(
      makeFurnitureObb(
        result.best!.x_mm,
        result.best!.y_mm,
        result.best!.rotation_deg,
        1500,
        2000,
      ),
    );
    // Front corners (local +y, indices 2 and 3) must respect the clearance
    // even when the back face is flush against a wall.
    for (const i of [2, 3]) {
      expect(distancePointToPolygonEdge(corners[i]!, room)).toBeGreaterThanOrEqual(100 - 0.01);
    }
  });

  it("returns no placement when clearance is too aggressive to fit", () => {
    // 2x2 m room with a 1.4x0.8 m table needs ≥ 600 mm clearance to be impossible
    // (after a centred placement leaves 300 mm to the long walls and 600 mm to the
    // short walls). Use 700 mm clearance to push past the lateral 300 mm slack.
    const result = autoPlace({
      roomPolygon: rectRoom(2000, 2000),
      existing: [],
      candidate: { width_mm: 1400, depth_mm: 800, height_mm: 750, category: "식탁/의자" },
      clearanceMm: 400,
    });
    expect(result.best).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("auto-placement v1 — non-rectangular rooms", () => {
  it("does not place furniture into the L-shape notch", () => {
    const room = lShapedRoom();
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1400, depth_mm: 700, height_mm: 750, category: "책상" },
    });
    expect(result.best).not.toBeNull();
    const obb = makeFurnitureObb(
      result.best!.x_mm,
      result.best!.y_mm,
      result.best!.rotation_deg,
      1400,
      700,
    );
    expect(obbInsidePolygon(obb, room)).toBe(true);
  });

  it("runs in well under 100ms for a typical room", () => {
    const start = performance.now();
    autoPlace({
      roomPolygon: rectRoom(5000, 4000),
      existing: [
        { x_mm: 2500, y_mm: 225, rotation_deg: 0, width_mm: 1800, depth_mm: 450, category: "TV장" },
      ],
      candidate: { width_mm: 2200, depth_mm: 900, height_mm: 850, category: "소파" },
      k: 5,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── DPR-118: empty-room best-pose regression ────────────────────────────────
// Verifies that autoPlace always returns a non-null best for realistic empty
// rooms and that the chosen position is NOT stuck at the room centroid (±200mm).
// This guards against the FE "always-centred" symptom reported in DPR-115.

const CENTROID_TOLERANCE_MM = 200;

function notNearCentroid(
  x_mm: number,
  y_mm: number,
  roomW: number,
  roomD: number,
) {
  const cx = roomW / 2;
  const cy = roomD / 2;
  return Math.hypot(x_mm - cx, y_mm - cy) > CENTROID_TOLERANCE_MM;
}

describe("DPR-118 regression — empty room, non-centred best pose", () => {
  const SMALL_ROOM = { w: 3000, d: 3000 } as const;
  const MEDIUM_ROOM = { w: 4500, d: 5000 } as const;

  // Wall-aligned categories (소파, 침대) must NOT land near the centroid.
  const wallAlignedCases: Array<{
    label: string;
    category: "소파" | "침대";
    width_mm: number;
    depth_mm: number;
    height_mm: number;
    room: { readonly w: number; readonly d: number };
  }> = [
    { label: "소파 small",  category: "소파", width_mm: 2000, depth_mm: 850,  height_mm: 850,  room: SMALL_ROOM },
    { label: "소파 medium", category: "소파", width_mm: 2200, depth_mm: 900,  height_mm: 850,  room: MEDIUM_ROOM },
    { label: "침대 small",  category: "침대", width_mm: 1100, depth_mm: 2000, height_mm: 500,  room: SMALL_ROOM },
    { label: "침대 medium", category: "침대", width_mm: 1600, depth_mm: 2000, height_mm: 700,  room: MEDIUM_ROOM },
  ];

  for (const c of wallAlignedCases) {
    it(`${c.label} — best is non-null and not at room centre`, () => {
      const room = rectRoom(c.room.w, c.room.d);
      const result = autoPlace({
        roomPolygon: room,
        existing: [],
        candidate: { width_mm: c.width_mm, depth_mm: c.depth_mm, height_mm: c.height_mm, category: c.category },
      });
      expect(result.best).not.toBeNull();
      expect(
        notNearCentroid(result.best!.x_mm, result.best!.y_mm, c.room.w, c.room.d),
      ).toBe(true);
    });
  }

  // 식탁/의자 intentionally biases toward centroid — just verify it returns a result.
  it("식탁 small (3000×3000) — best is non-null (centroid placement is expected)", () => {
    const room = rectRoom(3000, 3000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1200, depth_mm: 800, height_mm: 750, category: "식탁/의자" },
    });
    expect(result.best).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("식탁 medium (4500×5000) — best is non-null (centroid placement is expected)", () => {
    const room = rectRoom(4500, 5000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1400, depth_mm: 800, height_mm: 750, category: "식탁/의자" },
    });
    expect(result.best).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("침대 1100×2000 in 4500×5000 — best is wall-aligned, not centred", () => {
    const room = rectRoom(4500, 5000);
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 1100, depth_mm: 2000, height_mm: 500, category: "침대" },
    });
    expect(result.best).not.toBeNull();
    expect(notNearCentroid(result.best!.x_mm, result.best!.y_mm, 4500, 5000)).toBe(true);
    // Bed must be wall-aligned (close to one wall)
    const { x_mm, y_mm } = result.best!;
    const minWallDist = Math.min(x_mm, 4500 - x_mm, y_mm, 5000 - y_mm);
    // Centre of a wall-aligned 2000mm-deep bed sits ~1000mm from its back wall
    expect(minWallDist).toBeLessThanOrEqual(1100);
  });

  it("L-shaped room — best is non-null and not at centroid for sofa", () => {
    const room = lShapedRoom(); // 4000×4000 with 1500×1500 notch
    const result = autoPlace({
      roomPolygon: room,
      existing: [],
      candidate: { width_mm: 2000, depth_mm: 850, height_mm: 850, category: "소파" },
    });
    expect(result.best).not.toBeNull();
    // L-room centroid ≈ (1750, 1750) — best should be clearly off-centre
    expect(
      notNearCentroid(result.best!.x_mm, result.best!.y_mm, 4000, 4000),
    ).toBe(true);
  });
});

// ─── Regression: DPR-95 — catalog uses English categories (sofa, chair, …) ────
//
// `furniture_catalog` rows are seeded with English category strings. autoPlace
// rejected those with `BAD_REQUEST` because the category allow-list is Korean.
// `normalizeFurnitureCategory` maps both English and loose-Korean labels to the
// canonical FurnitureCategory so autoPlace works for every active catalog row.
describe("normalizeFurnitureCategory (DPR-95)", () => {
  it("maps English seeded categories → canonical Korean", () => {
    expect(normalizeFurnitureCategory("sofa")).toBe("소파");
    expect(normalizeFurnitureCategory("bed")).toBe("침대");
    expect(normalizeFurnitureCategory("chair")).toBe("식탁/의자");
    expect(normalizeFurnitureCategory("table")).toBe("식탁/의자");
    expect(normalizeFurnitureCategory("desk")).toBe("책상");
    expect(normalizeFurnitureCategory("storage")).toBe("수납장");
  });

  it("passes through canonical Korean unchanged", () => {
    expect(normalizeFurnitureCategory("소파")).toBe("소파");
    expect(normalizeFurnitureCategory("식탁/의자")).toBe("식탁/의자");
    expect(normalizeFurnitureCategory("TV장")).toBe("TV장");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(normalizeFurnitureCategory("SOFA")).toBe("소파");
    expect(normalizeFurnitureCategory("  Chair  ")).toBe("식탁/의자");
    expect(normalizeFurnitureCategory("tv")).toBe("TV장");
  });

  it("falls back to 기타 for unknown rather than throwing", () => {
    expect(normalizeFurnitureCategory("plant")).toBe("기타");
    expect(normalizeFurnitureCategory("")).toBe("기타");
  });

  it("autoPlace returns a non-null best for an English-category sofa (regression)", () => {
    const result = autoPlace({
      roomPolygon: rectRoom(4500, 5000),
      existing: [],
      candidate: {
        width_mm: 2000,
        depth_mm: 850,
        height_mm: 850,
        category: normalizeFurnitureCategory("sofa"),
      },
    });
    expect(result.best).not.toBeNull();
  });
});

// ─── Regression: DPR-95 — autoPlace must return integer x_mm/y_mm ─────────────
//
// addFurniture's Zod schema uses `z.number().int()` for x_mm/y_mm. Pose
// generation produces floats (wall-aligned candidates inset by halfDepth), and
// passing those through silently fails with HTTP 400 in the browser confirm
// step. Rounding at the autoPlace boundary keeps the schema invariant.
describe("autoPlace integer coordinates (DPR-95)", () => {
  it("returns integer x_mm/y_mm for best and alternatives across diverse candidates", () => {
    const cases = [
      { w: 1545, d: 740, cat: "책상" as const },     // IKEA 알렉스 책상 — was x=982.5
      { w: 1605, d: 2095, cat: "침대" as const },    // 퀸 — was y=3762.5
      { w: 1985, d: 2095, cat: "침대" as const },    // 킹 — was x=2487.5
      { w: 2000, d: 850, cat: "소파" as const },
      { w: 1400, d: 800, cat: "식탁/의자" as const },
    ];
    for (const c of cases) {
      const result = autoPlace({
        roomPolygon: rectRoom(4500, 5000),
        existing: [],
        candidate: { width_mm: c.w, depth_mm: c.d, height_mm: 700, category: c.cat },
        k: 3,
      });
      expect(result.best, `no best for ${c.cat} ${c.w}x${c.d}`).not.toBeNull();
      expect(Number.isInteger(result.best!.x_mm), `best.x_mm not int for ${c.cat}`).toBe(true);
      expect(Number.isInteger(result.best!.y_mm), `best.y_mm not int for ${c.cat}`).toBe(true);
      for (const alt of result.alternatives) {
        expect(Number.isInteger(alt.x_mm), `alt.x_mm not int for ${c.cat}`).toBe(true);
        expect(Number.isInteger(alt.y_mm), `alt.y_mm not int for ${c.cat}`).toBe(true);
      }
    }
  });
});
