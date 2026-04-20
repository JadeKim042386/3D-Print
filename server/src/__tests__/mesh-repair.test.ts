import { describe, it, expect } from "vitest";
import { repairStlMesh } from "../lib/mesh-repair.js";
import { analyzeStlPrintReadiness } from "../lib/print-readiness.js";

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

  const tris: Array<{ normal: V3; verts: [V3, V3, V3] }> = [
    { normal: [0, 0, -1], verts: [v[0]!, v[2]!, v[1]!] },
    { normal: [0, 0, -1], verts: [v[0]!, v[3]!, v[2]!] },
    { normal: [0, 0, 1], verts: [v[4]!, v[5]!, v[6]!] },
    { normal: [0, 0, 1], verts: [v[4]!, v[6]!, v[7]!] },
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

describe("mesh-repair — STL normal flipping", () => {
  it("should not modify an already-valid mesh", () => {
    const stl = buildBoxStl(50, 50, 50);
    const result = repairStlMesh(stl);
    expect(result.normalsFlipped).toBe(0);
    expect(result.repairsApplied).toHaveLength(0);
    expect(result.buffer.equals(stl)).toBe(true);
  });

  it("should flip inverted normals", () => {
    const stl = buildBoxStl(50, 50, 50);
    const triCount = stl.readUInt32LE(80);

    // Invert all normals
    let off = 84;
    for (let i = 0; i < triCount; i++) {
      stl.writeFloatLE(-stl.readFloatLE(off), off);
      stl.writeFloatLE(-stl.readFloatLE(off + 4), off + 4);
      stl.writeFloatLE(-stl.readFloatLE(off + 8), off + 8);
      off += 50;
    }

    const beforeReport = analyzeStlPrintReadiness(stl);
    expect(beforeReport.invertedNormalCount).toBe(triCount);

    const result = repairStlMesh(stl);
    expect(result.normalsFlipped).toBe(triCount);
    expect(result.repairsApplied.length).toBeGreaterThan(0);

    // After repair, normals should be consistent
    const afterReport = analyzeStlPrintReadiness(result.buffer);
    expect(afterReport.hasConsistentNormals).toBe(true);
    expect(afterReport.invertedNormalCount).toBe(0);
  });

  it("should improve print-readiness score after repair", () => {
    const stl = buildBoxStl(50, 50, 50);
    const triCount = stl.readUInt32LE(80);

    // Invert all normals
    let off = 84;
    for (let i = 0; i < triCount; i++) {
      stl.writeFloatLE(-stl.readFloatLE(off), off);
      stl.writeFloatLE(-stl.readFloatLE(off + 4), off + 4);
      stl.writeFloatLE(-stl.readFloatLE(off + 8), off + 8);
      off += 50;
    }

    const beforeScore = analyzeStlPrintReadiness(stl).printQualityScore;
    const repaired = repairStlMesh(stl).buffer;
    const afterScore = analyzeStlPrintReadiness(repaired).printQualityScore;

    expect(afterScore).toBeGreaterThanOrEqual(beforeScore);
  });

  it("should handle empty buffers gracefully", () => {
    const empty = Buffer.alloc(10);
    const result = repairStlMesh(empty);
    expect(result.normalsFlipped).toBe(0);
    expect(result.buffer.equals(empty)).toBe(true);
  });

  it("should not mutate the input buffer", () => {
    const stl = buildBoxStl(50, 50, 50);
    const triCount = stl.readUInt32LE(80);

    // Invert normals
    let off = 84;
    for (let i = 0; i < triCount; i++) {
      stl.writeFloatLE(-stl.readFloatLE(off), off);
      off += 50;
    }

    const original = Buffer.from(stl);
    repairStlMesh(stl);
    expect(stl.equals(original)).toBe(true);
  });
});
