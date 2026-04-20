import { describe, it, expect } from "vitest";
import { analyzeStlQuality } from "../lib/mesh-quality.js";

type V3 = [number, number, number];

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

describe("mesh-quality — STL analysis", () => {
  it("should report correct triangle and vertex counts", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlQuality(stl);
    expect(report.triangleCount).toBe(12);
    expect(report.vertexCount).toBe(36);
    expect(report.format).toBe("stl");
  });

  it("should compute correct bounding box", () => {
    const stl = buildBoxStl(100, 80, 60);
    const report = analyzeStlQuality(stl);
    expect(report.boundingBox.width_mm).toBeCloseTo(100, 0);
    expect(report.boundingBox.height_mm).toBeCloseTo(80, 0);
    expect(report.boundingBox.depth_mm).toBeCloseTo(60, 0);
  });

  it("should compute non-zero volume and surface area for a box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlQuality(stl);
    expect(report.volume_mm3).toBeGreaterThan(0);
    expect(report.surfaceArea_mm2).toBeGreaterThan(0);
    // Expected: volume = 50*50*50 = 125000
    expect(report.volume_mm3).toBeCloseTo(125000, -2);
    // Expected: surface area = 6 * 50*50 = 15000
    expect(report.surfaceArea_mm2).toBeCloseTo(15000, -2);
  });

  it("should report no degenerate triangles for a valid box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlQuality(stl);
    expect(report.degenerateTriangles).toBe(0);
  });

  it("should compute aspect ratio correctly", () => {
    const stl = buildBoxStl(100, 100, 100);
    const report = analyzeStlQuality(stl);
    expect(report.aspectRatio).toBeCloseTo(1, 0);

    const thinPlate = buildBoxStl(200, 200, 5);
    const plateReport = analyzeStlQuality(thinPlate);
    expect(plateReport.aspectRatio).toBe(40);
  });

  it("should flag extreme aspect ratios", () => {
    const stl = buildBoxStl(200, 200, 5);
    const report = analyzeStlQuality(stl);
    expect(report.warnings.some((w) => w.includes("aspect ratio"))).toBe(true);
    expect(report.printabilityScore).toBeLessThan(100);
  });

  it("should flag very thin dimensions", () => {
    const stl = buildBoxStl(50, 50, 0.3);
    const report = analyzeStlQuality(stl);
    expect(report.warnings.some((w) => w.includes("too thin"))).toBe(true);
  });

  it("should give high printability score for a normal box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlQuality(stl);
    // Low tri count (12) will cause a warning, but it's still reasonable
    expect(report.printabilityScore).toBeGreaterThanOrEqual(60);
  });

  it("should handle empty/corrupt buffers gracefully", () => {
    const empty = Buffer.alloc(10);
    const report = analyzeStlQuality(empty);
    expect(report.triangleCount).toBe(0);
    expect(report.printabilityScore).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("should detect degenerate triangles", () => {
    // Create a box with one degenerate triangle (all vertices same)
    const stl = buildBoxStl(50, 50, 50);
    // Overwrite the last triangle's vertices to be identical (degenerate)
    const lastTriOffset = 84 + 11 * 50;
    for (let v = 0; v < 3; v++) {
      stl.writeFloatLE(0, lastTriOffset + 12 + v * 12);
      stl.writeFloatLE(0, lastTriOffset + 12 + v * 12 + 4);
      stl.writeFloatLE(0, lastTriOffset + 12 + v * 12 + 8);
    }

    const report = analyzeStlQuality(stl);
    expect(report.degenerateTriangles).toBe(1);
    expect(report.warnings.some((w) => w.includes("degenerate"))).toBe(true);
  });
});
