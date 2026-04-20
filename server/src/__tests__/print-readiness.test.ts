import { describe, it, expect } from "vitest";
import { analyzeStlPrintReadiness, analyzePrintReadiness } from "../lib/print-readiness.js";

type V3 = [number, number, number];

/**
 * Build a valid watertight box STL with correct normals.
 */
function buildBoxStl(wMm: number, hMm: number, dMm: number): Buffer {
  const w = wMm / 2;
  const h = hMm / 2;
  const d = dMm / 2;
  const v: V3[] = [
    [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
    [-w, -h,  d], [w, -h,  d], [w, h,  d], [-w, h,  d],
  ];

  // 12 triangles with outward-facing winding order
  const tris: Array<{ normal: V3; verts: [V3, V3, V3] }> = [
    // -Z face (normal [0,0,-1])
    { normal: [0, 0, -1], verts: [v[0]!, v[2]!, v[1]!] },
    { normal: [0, 0, -1], verts: [v[0]!, v[3]!, v[2]!] },
    // +Z face (normal [0,0,1])
    { normal: [0, 0, 1], verts: [v[4]!, v[5]!, v[6]!] },
    { normal: [0, 0, 1], verts: [v[4]!, v[6]!, v[7]!] },
    // -X face (normal [-1,0,0])
    { normal: [-1, 0, 0], verts: [v[0]!, v[4]!, v[7]!] },
    { normal: [-1, 0, 0], verts: [v[0]!, v[7]!, v[3]!] },
    // +X face (normal [1,0,0])
    { normal: [1, 0, 0], verts: [v[1]!, v[2]!, v[6]!] },
    { normal: [1, 0, 0], verts: [v[1]!, v[6]!, v[5]!] },
    // -Y face (normal [0,-1,0])
    { normal: [0, -1, 0], verts: [v[0]!, v[1]!, v[5]!] },
    { normal: [0, -1, 0], verts: [v[0]!, v[5]!, v[4]!] },
    // +Y face (normal [0,1,0])
    { normal: [0, 1, 0], verts: [v[2]!, v[3]!, v[7]!] },
    { normal: [0, 1, 0], verts: [v[2]!, v[7]!, v[6]!] },
  ];

  const buf = Buffer.alloc(80 + 4 + tris.length * 50);
  buf.write("test box", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  let off = 84;
  for (const tri of tris) {
    buf.writeFloatLE(tri.normal[0], off);
    buf.writeFloatLE(tri.normal[1], off + 4);
    buf.writeFloatLE(tri.normal[2], off + 8);
    for (let i = 0; i < 3; i++) {
      buf.writeFloatLE(tri.verts[i]![0], off + 12 + i * 12);
      buf.writeFloatLE(tri.verts[i]![1], off + 12 + i * 12 + 4);
      buf.writeFloatLE(tri.verts[i]![2], off + 12 + i * 12 + 8);
    }
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf;
}

/**
 * Build an open mesh (missing one face) to test non-watertight detection.
 */
function buildOpenBoxStl(wMm: number, hMm: number, dMm: number): Buffer {
  const w = wMm / 2;
  const h = hMm / 2;
  const d = dMm / 2;
  const v: V3[] = [
    [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
    [-w, -h,  d], [w, -h,  d], [w, h,  d], [-w, h,  d],
  ];

  // Only 5 faces (10 triangles) — missing +Z face
  const tris: Array<{ normal: V3; verts: [V3, V3, V3] }> = [
    { normal: [0, 0, -1], verts: [v[0]!, v[2]!, v[1]!] },
    { normal: [0, 0, -1], verts: [v[0]!, v[3]!, v[2]!] },
    { normal: [-1, 0, 0], verts: [v[0]!, v[4]!, v[7]!] },
    { normal: [-1, 0, 0], verts: [v[0]!, v[7]!, v[3]!] },
    { normal: [1, 0, 0], verts: [v[1]!, v[2]!, v[6]!] },
    { normal: [1, 0, 0], verts: [v[1]!, v[6]!, v[5]!] },
    { normal: [0, -1, 0], verts: [v[0]!, v[1]!, v[5]!] },
    { normal: [0, -1, 0], verts: [v[0]!, v[5]!, v[4]!] },
    { normal: [0, 1, 0], verts: [v[2]!, v[3]!, v[7]!] },
    { normal: [0, 1, 0], verts: [v[2]!, v[7]!, v[6]!] },
  ];

  const buf = Buffer.alloc(80 + 4 + tris.length * 50);
  buf.write("open box", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  let off = 84;
  for (const tri of tris) {
    buf.writeFloatLE(tri.normal[0], off);
    buf.writeFloatLE(tri.normal[1], off + 4);
    buf.writeFloatLE(tri.normal[2], off + 8);
    for (let i = 0; i < 3; i++) {
      buf.writeFloatLE(tri.verts[i]![0], off + 12 + i * 12);
      buf.writeFloatLE(tri.verts[i]![1], off + 12 + i * 12 + 4);
      buf.writeFloatLE(tri.verts[i]![2], off + 12 + i * 12 + 8);
    }
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf;
}

describe("print-readiness — STL analysis", () => {
  it("should detect a watertight closed box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.isWatertight).toBe(true);
    expect(report.isManifold).toBe(true);
    expect(report.holeCount).toBe(0);
  });

  it("should detect an open (non-watertight) mesh", () => {
    const stl = buildOpenBoxStl(50, 50, 50);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.isWatertight).toBe(false);
    expect(report.holeCount).toBeGreaterThan(0);
  });

  it("should report consistent normals for a valid box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.hasConsistentNormals).toBe(true);
    expect(report.invertedNormalCount).toBe(0);
  });

  it("should detect inverted normals", () => {
    const stl = buildBoxStl(50, 50, 50);
    // Invert all normals by negating them
    let off = 84;
    const triCount = stl.readUInt32LE(80);
    for (let i = 0; i < triCount; i++) {
      stl.writeFloatLE(-stl.readFloatLE(off), off);
      stl.writeFloatLE(-stl.readFloatLE(off + 4), off + 4);
      stl.writeFloatLE(-stl.readFloatLE(off + 8), off + 8);
      off += 50;
    }

    const report = analyzeStlPrintReadiness(stl);
    expect(report.invertedNormalCount).toBe(triCount);
    expect(report.hasConsistentNormals).toBe(false);
  });

  it("should flag thin wall thickness below 1mm", () => {
    const stl = buildBoxStl(50, 50, 0.8);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.minWallThickness_mm).toBeLessThan(1);
    expect(report.issues.some((i) => i.includes("wall thickness") || i.includes("Wall thickness"))).toBe(true);
  });

  it("should flag very thin wall thickness below 0.5mm", () => {
    const stl = buildBoxStl(50, 50, 0.3);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.minWallThickness_mm).toBeLessThan(0.5);
    expect(report.printQualityScore).toBeLessThanOrEqual(70);
  });

  it("should give high score and print_ready for a good box", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.printQualityScore).toBe(100);
    expect(report.printReady).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("should not be print_ready when not watertight even with decent score", () => {
    const stl = buildOpenBoxStl(50, 50, 50);
    const report = analyzeStlPrintReadiness(stl);
    expect(report.printReady).toBe(false);
  });

  it("should handle empty/corrupt buffers gracefully", () => {
    const empty = Buffer.alloc(10);
    const report = analyzeStlPrintReadiness(empty);
    expect(report.printQualityScore).toBe(0);
    expect(report.printReady).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it("should handle zero-triangle STL", () => {
    const buf = Buffer.alloc(84);
    buf.writeUInt32LE(0, 80);
    const report = analyzeStlPrintReadiness(buf);
    expect(report.printQualityScore).toBe(0);
    expect(report.printReady).toBe(false);
  });

  it("analyzePrintReadiness dispatches to STL analyzer", () => {
    const stl = buildBoxStl(50, 50, 50);
    const report = analyzePrintReadiness(stl, "stl");
    expect(report.isWatertight).toBe(true);
    expect(report.printReady).toBe(true);
  });

  it("analyzePrintReadiness returns conservative report for GLB", () => {
    const buf = Buffer.alloc(100);
    const report = analyzePrintReadiness(buf, "glb");
    expect(report.printQualityScore).toBe(50);
    expect(report.printReady).toBe(false);
    expect(report.issues.some((i) => i.includes("GLB"))).toBe(true);
  });
});
