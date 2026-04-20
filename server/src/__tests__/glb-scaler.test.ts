import { describe, it, expect } from "vitest";
import { scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions, toleranceForSize } from "../lib/dimension-validator.js";

/**
 * Build a minimal valid GLB containing a single-triangle mesh.
 * GLTF coordinates are in metres, so a 50mm cube is 0.025m half-extent.
 */
function buildMinimalGlb(wMm: number, hMm: number, dMm: number): Buffer {
  const hw = wMm / 2000; // half-width in metres
  const hh = hMm / 2000;
  const hd = dMm / 2000;

  // 8 vertices for a box, 12 triangles (2 per face)
  const vertices: number[][] = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    [-hw, -hh,  hd], [hw, -hh,  hd], [hw, hh,  hd], [-hw, hh,  hd],
  ];

  // 12 triangles (indices into the vertex array)
  const indices = [
    0,2,1, 0,3,2,  // -Z
    4,5,6, 4,6,7,  // +Z
    0,4,7, 0,7,3,  // -X
    1,2,6, 1,6,5,  // +X
    0,1,5, 0,5,4,  // -Y
    2,3,7, 2,7,6,  // +Y
  ];

  // Build position data (Float32)
  const posData = Buffer.alloc(vertices.length * 3 * 4);
  let pMin = [Infinity, Infinity, Infinity];
  let pMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    posData.writeFloatLE(v[0]!, i * 12);
    posData.writeFloatLE(v[1]!, i * 12 + 4);
    posData.writeFloatLE(v[2]!, i * 12 + 8);
    for (let a = 0; a < 3; a++) {
      if (v[a]! < pMin[a]!) pMin[a] = v[a]!;
      if (v[a]! > pMax[a]!) pMax[a] = v[a]!;
    }
  }

  // Build index data (Uint16)
  const idxData = Buffer.alloc(indices.length * 2);
  for (let i = 0; i < indices.length; i++) {
    idxData.writeUInt16LE(indices[i]!, i * 2);
  }

  // Combine into binary blob: positions first, then indices
  const binData = Buffer.concat([posData, idxData]);

  const gltfJson = {
    asset: { version: "2.0", generator: "test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
      }],
    }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: vertices.length,
        type: "VEC3",
        min: pMin,
        max: pMax,
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: indices.length,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posData.length },
      { buffer: 0, byteOffset: posData.length, byteLength: idxData.length },
    ],
    buffers: [{ byteLength: binData.length }],
  };

  // Encode JSON chunk
  const jsonStr = JSON.stringify(gltfJson);
  const jsonBytes = Buffer.from(jsonStr, "utf8");
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkData = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  // Encode BIN chunk
  const binPad = (4 - (binData.length % 4)) % 4;
  const binChunkData = Buffer.concat([binData, Buffer.alloc(binPad, 0x00)]);

  // JSON chunk header
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4);

  // BIN chunk header
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunkData.length, 0);
  binHeader.writeUInt32LE(0x004E4942, 4);

  const body = Buffer.concat([jsonHeader, jsonChunkData, binHeader, binChunkData]);

  // GLB header
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic
  header.writeUInt32LE(2, 4);           // version
  header.writeUInt32LE(12 + body.length, 8);

  return Buffer.concat([header, body]);
}

describe("dimension-scaler — GLB", () => {
  it("should scale a GLB box to exact dimensions", async () => {
    const input = buildMinimalGlb(50, 50, 50);
    const target = { width_mm: 100, height_mm: 80, depth_mm: 60, mode: "exact" as const };

    const result = await scaleBufferToDimensions(input, target, "glb");

    expect(result.format).toBe("glb");
    expect(result.actualDimensions.width_mm).toBeCloseTo(100, 0);
    expect(result.actualDimensions.height_mm).toBeCloseTo(80, 0);
    expect(result.actualDimensions.depth_mm).toBeCloseTo(60, 0);
  });

  it("should scale a GLB box proportionally", async () => {
    const input = buildMinimalGlb(50, 50, 50);
    const target = { width_mm: 200, height_mm: 100, depth_mm: 150, mode: "proportional" as const };

    const result = await scaleBufferToDimensions(input, target, "glb");

    // Proportional: uniform scale = min(200/50, 100/50, 150/50) = 2.0
    // Actual = 100x100x100
    expect(result.actualDimensions.width_mm).toBeCloseTo(100, 0);
    expect(result.actualDimensions.height_mm).toBeCloseTo(100, 0);
    expect(result.actualDimensions.depth_mm).toBeCloseTo(100, 0);
  });

  it("should pass validation for exact GLB scaling", async () => {
    const input = buildMinimalGlb(50, 50, 50);
    const target = { width_mm: 120, height_mm: 80, depth_mm: 60, mode: "exact" as const };

    const result = await scaleBufferToDimensions(input, target, "glb");
    const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
    const validation = validateDimensions(target, result.actualDimensions, toleranceForSize(maxDim));

    expect(validation.passed).toBe(true);
    expect(validation.accuracy_pct).toBeGreaterThanOrEqual(99);
  });

  it("should produce a valid GLB buffer (correct magic)", async () => {
    const input = buildMinimalGlb(50, 50, 50);
    const target = { width_mm: 100, height_mm: 100, depth_mm: 100, mode: "exact" as const };

    const result = await scaleBufferToDimensions(input, target, "glb");

    // Check GLB magic number
    expect(result.buffer.readUInt32LE(0)).toBe(0x46546C67);
    // Check version
    expect(result.buffer.readUInt32LE(4)).toBe(2);
    // Buffer length matches header
    expect(result.buffer.readUInt32LE(8)).toBe(result.buffer.length);
  });

  describe("quantitative GLB accuracy across size ranges", () => {
    const testCases = [
      { name: "miniature (10mm)", target: { width_mm: 10, height_mm: 8, depth_mm: 6 } },
      { name: "small (50mm)", target: { width_mm: 50, height_mm: 40, depth_mm: 30 } },
      { name: "medium (150mm)", target: { width_mm: 150, height_mm: 120, depth_mm: 80 } },
      { name: "large (500mm)", target: { width_mm: 500, height_mm: 300, depth_mm: 200 } },
      { name: "asymmetric", target: { width_mm: 300, height_mm: 50, depth_mm: 10 } },
    ];

    for (const tc of testCases) {
      it(`exact mode — ${tc.name}`, async () => {
        const input = buildMinimalGlb(50, 50, 50);
        const target = { ...tc.target, mode: "exact" as const };
        const result = await scaleBufferToDimensions(input, target, "glb");
        const maxDim = Math.max(target.width_mm, target.height_mm, target.depth_mm);
        const validation = validateDimensions(target, result.actualDimensions, toleranceForSize(maxDim));

        expect(validation.passed).toBe(true);
        expect(validation.accuracy_pct).toBeGreaterThanOrEqual(99);
      });
    }
  });
});
