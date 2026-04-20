import { describe, it, expect } from "vitest";
import { scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Helpers — build a known binary STL box
// ---------------------------------------------------------------------------

function buildBoxStl(wMm: number, hMm: number, dMm: number): Buffer {
  const w = wMm / 2;
  const h = hMm / 2;
  const d = dMm / 2;

  const v: V3[] = [
    [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
    [-w, -h,  d], [w, -h,  d], [w, h,  d], [-w, h,  d],
  ];

  const tris: Array<[V3, V3, V3]> = [
    [v[0]!, v[2]!, v[1]!], [v[0]!, v[3]!, v[2]!],
    [v[4]!, v[5]!, v[6]!], [v[4]!, v[6]!, v[7]!],
    [v[0]!, v[4]!, v[7]!], [v[0]!, v[7]!, v[3]!],
    [v[1]!, v[2]!, v[6]!], [v[1]!, v[6]!, v[5]!],
    [v[0]!, v[1]!, v[5]!], [v[0]!, v[5]!, v[4]!],
    [v[2]!, v[3]!, v[7]!], [v[2]!, v[7]!, v[6]!],
  ];

  const buf = Buffer.alloc(80 + 4 + tris.length * 50);
  buf.write("test box", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  let off = 84;
  for (const tri of tris) {
    buf.writeFloatLE(0, off); buf.writeFloatLE(0, off + 4); buf.writeFloatLE(0, off + 8);
    for (let i = 0; i < 3; i++) {
      buf.writeFloatLE(tri[i]![0], off + 12 + i * 12);
      buf.writeFloatLE(tri[i]![1], off + 12 + i * 12 + 4);
      buf.writeFloatLE(tri[i]![2], off + 12 + i * 12 + 8);
    }
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// dimension-scaler tests
// ---------------------------------------------------------------------------

describe("dimension-scaler — STL", () => {
  it("scales a 50mm cube to 100×80×60 proportionally", async () => {
    const input = buildBoxStl(50, 50, 50);
    const result = await scaleBufferToDimensions(
      input,
      { width_mm: 100, height_mm: 80, depth_mm: 60, mode: "proportional" },
      "stl"
    );
    // Proportional mode: scale = min(100/50, 80/50, 60/50) = 1.2
    // So actual = 60×60×60
    expect(result.actualDimensions.width_mm).toBeCloseTo(60, 0);
    expect(result.actualDimensions.height_mm).toBeCloseTo(60, 0);
    expect(result.actualDimensions.depth_mm).toBeCloseTo(60, 0);
  });

  it("scales a 50mm cube to 100×80×60 exactly", async () => {
    const input = buildBoxStl(50, 50, 50);
    const result = await scaleBufferToDimensions(
      input,
      { width_mm: 100, height_mm: 80, depth_mm: 60, mode: "exact" },
      "stl"
    );
    expect(result.actualDimensions.width_mm).toBeCloseTo(100, 0);
    expect(result.actualDimensions.height_mm).toBeCloseTo(80, 0);
    expect(result.actualDimensions.depth_mm).toBeCloseTo(60, 0);
  });

  it("preserves the STL triangle count", async () => {
    const input = buildBoxStl(50, 50, 50);
    const result = await scaleBufferToDimensions(
      input,
      { width_mm: 100, height_mm: 100, depth_mm: 100 },
      "stl"
    );
    expect(result.buffer.readUInt32LE(80)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// dimension-validator tests
// ---------------------------------------------------------------------------

describe("dimension-validator", () => {
  it("marks a result passed when within tolerance", () => {
    const r = validateDimensions(
      { width_mm: 100, height_mm: 100, depth_mm: 100 },
      { width_mm: 100.2, height_mm: 99.9, depth_mm: 100.1 }
    );
    expect(r.passed).toBe(true);
    expect(r.accuracy_pct).toBeGreaterThan(99);
    expect(r.max_error_mm).toBeCloseTo(0.2, 1);
  });

  it("marks a result failed when exceeding tolerance", () => {
    const r = validateDimensions(
      { width_mm: 100, height_mm: 100, depth_mm: 100 },
      { width_mm: 102, height_mm: 100, depth_mm: 100 }
    );
    expect(r.passed).toBe(false);
    expect(r.max_error_mm).toBeCloseTo(2, 0);
  });

  it("toleranceForSize returns tighter tolerance for small objects", () => {
    expect(toleranceForSize(30)).toBe(0.3);
    expect(toleranceForSize(100)).toBe(0.5);
    expect(toleranceForSize(500)).toBe(1.0);
  });
});
