/**
 * dimension-scaler.ts
 *
 * Post-processes a 3D model buffer to rescale it to exact physical dimensions.
 * Supports GLB/GLTF and binary STL formats.
 *
 * Strategy:
 *  1. Parse the mesh and compute the AABB (axis-aligned bounding box) in model space.
 *  2. Determine scale factors from current size → target dimensions.
 *  3. Apply scale to the root scene node (GLB) or directly to vertices (STL).
 *  4. Return the scaled buffer plus measured actual dimensions.
 */

import type { DimensionSpec, MeshDimensions, ScalingMode } from "../types/generation.js";

export interface ScaleResult {
  buffer: Buffer;
  actualDimensions: MeshDimensions;
  format: "glb" | "stl";
}

// ---------------------------------------------------------------------------
// AABB helpers
// ---------------------------------------------------------------------------

interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function emptyAABB(): AABB {
  return {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };
}

function aabbSize(b: AABB): MeshDimensions {
  return {
    // Convert from model units (metres in GLTF, mm in STL convention) to mm
    // GLB: multiply by 1000; STL: already mm
    width_mm:  b.maxX - b.minX,
    height_mm: b.maxY - b.minY,
    depth_mm:  b.maxZ - b.minZ,
  };
}

function scaleFactors(
  current: MeshDimensions,
  target: DimensionSpec,
  mode: ScalingMode
): { sx: number; sy: number; sz: number } {
  const { width_mm: tw, height_mm: th, depth_mm: td } = target;
  const { width_mm: cw, height_mm: ch, depth_mm: cd } = current;

  if (mode === "exact") {
    return {
      sx: tw / (cw || 1),
      sy: th / (ch || 1),
      sz: td / (cd || 1),
    };
  }

  // proportional: use smallest scale so model fits within the requested box
  const s = Math.min(tw / (cw || 1), th / (ch || 1), td / (cd || 1));
  return { sx: s, sy: s, sz: s };
}

// ---------------------------------------------------------------------------
// GLB / GLTF processing (pure JSON manipulation, no heavy dependencies)
// ---------------------------------------------------------------------------

/**
 * GLB binary layout:
 *  - 12 bytes header (magic, version, total length)
 *  - JSON chunk: 8-byte header + JSON data (padded with 0x20)
 *  - BIN chunk:  8-byte header + binary blob (padded with 0x00)
 */

function readGlbChunks(buf: Buffer): { json: Record<string, unknown>; bin: Buffer | null } {
  // Header: magic=0x46546C67, version=2, length
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error("Not a valid GLB file (bad magic)");

  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Buffer | null = null;

  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    const chunkData = buf.subarray(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4E4F534A) {
      // JSON chunk
      json = JSON.parse(chunkData.toString("utf8")) as Record<string, unknown>;
    } else if (chunkType === 0x004E4942) {
      // BIN chunk
      bin = Buffer.from(chunkData);
    }
  }

  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

function writeGlbChunks(json: Record<string, unknown>, bin: Buffer | null): Buffer {
  // JSON chunk (padded to 4-byte boundary with spaces)
  const jsonStr = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonStr, "utf8");
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkData = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  const chunks: Buffer[] = [];

  // JSON chunk header
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4);
  chunks.push(jsonHeader, jsonChunkData);

  if (bin && bin.length > 0) {
    // BIN chunk (padded to 4-byte boundary with zeros)
    const binPad = (4 - (bin.length % 4)) % 4;
    const binChunkData = Buffer.concat([bin, Buffer.alloc(binPad, 0x00)]);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binChunkData.length, 0);
    binHeader.writeUInt32LE(0x004E4942, 4);
    chunks.push(binHeader, binChunkData);
  }

  const body = Buffer.concat(chunks);

  // GLB header
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic
  header.writeUInt32LE(2, 4);           // version
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** GLTF accessor component types */
const COMPONENT_SIZES: Record<number, number> = {
  5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4,
};
const ACCESSOR_ELEMENT_COUNTS: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4,
  MAT2: 4, MAT3: 9, MAT4: 16,
};

interface GltfJson extends Record<string, unknown> {
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
    }>;
  }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    matrix?: number[];
  }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
}

/**
 * Read float32 accessor data from GLB binary blob.
 * Only handles FLOAT component type (5126). Returns flat Float32Array.
 */
function readAccessorFloat32(
  gltf: GltfJson,
  bin: Buffer,
  accessorIndex: number
): Float32Array {
  const acc = gltf.accessors![accessorIndex]!;
  if (acc.componentType !== 5126) {
    throw new Error(`Accessor ${accessorIndex} is not FLOAT (got ${acc.componentType})`);
  }
  const numComponents = ACCESSOR_ELEMENT_COUNTS[acc.type] ?? 1;
  const numElements = acc.count;
  const bv = gltf.bufferViews![acc.bufferView ?? 0]!;
  const byteStride = bv.byteStride ?? numComponents * 4;
  const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);

  const result = new Float32Array(numElements * numComponents);
  for (let i = 0; i < numElements; i++) {
    for (let c = 0; c < numComponents; c++) {
      result[i * numComponents + c] = bin.readFloatLE(baseOffset + i * byteStride + c * 4);
    }
  }
  return result;
}

/**
 * Write float32 data back into the binary buffer.
 */
function writeAccessorFloat32(
  gltf: GltfJson,
  bin: Buffer,
  accessorIndex: number,
  data: Float32Array
): void {
  const acc = gltf.accessors![accessorIndex]!;
  const numComponents = ACCESSOR_ELEMENT_COUNTS[acc.type] ?? 1;
  const numElements = acc.count;
  const bv = gltf.bufferViews![acc.bufferView ?? 0]!;
  const byteStride = bv.byteStride ?? numComponents * 4;
  const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);

  for (let i = 0; i < numElements; i++) {
    for (let c = 0; c < numComponents; c++) {
      bin.writeFloatLE(data[i * numComponents + c]!, baseOffset + i * byteStride + c * 4);
    }
  }
}

/**
 * Compute AABB from a POSITION accessor.
 * GLTF stores positions in metres; we convert to mm by ×1000.
 */
function computeGlbAABB(gltf: GltfJson, bin: Buffer): AABB {
  const aabb = emptyAABB();
  if (!gltf.meshes) return aabb;

  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes["POSITION"];
      if (posIdx == null) continue;
      const pos = readAccessorFloat32(gltf, bin, posIdx);
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]! * 1000;
        const y = pos[i + 1]! * 1000;
        const z = pos[i + 2]! * 1000;
        if (x < aabb.minX) aabb.minX = x;
        if (x > aabb.maxX) aabb.maxX = x;
        if (y < aabb.minY) aabb.minY = y;
        if (y > aabb.maxY) aabb.maxY = y;
        if (z < aabb.minZ) aabb.minZ = z;
        if (z > aabb.maxZ) aabb.maxZ = z;
      }
    }
  }
  return aabb;
}

/**
 * Scale all POSITION accessors in the GLB by (sx, sy, sz).
 * Positions are stored in metres; we scale and update the accessor min/max too.
 */
function scaleGlbPositions(
  gltf: GltfJson,
  bin: Buffer,
  sx: number,
  sy: number,
  sz: number
): void {
  if (!gltf.meshes) return;

  const scaledAccessors = new Set<number>();
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes["POSITION"];
      if (posIdx == null || scaledAccessors.has(posIdx)) continue;
      scaledAccessors.add(posIdx);

      const pos = readAccessorFloat32(gltf, bin, posIdx);
      for (let i = 0; i < pos.length; i += 3) {
        pos[i]!     *= sx;
        pos[i + 1]! *= sy;
        pos[i + 2]! *= sz;
      }
      writeAccessorFloat32(gltf, bin, posIdx, pos);

      // Update accessor min/max
      const acc = gltf.accessors![posIdx]!;
      if (acc.min) acc.min = [acc.min[0]! * sx, acc.min[1]! * sy, acc.min[2]! * sz];
      if (acc.max) acc.max = [acc.max[0]! * sx, acc.max[1]! * sy, acc.max[2]! * sz];
    }
  }
}

async function scaleGlb(
  input: Buffer,
  spec: DimensionSpec
): Promise<ScaleResult> {
  const { json, bin } = readGlbChunks(input);
  const gltf = json as GltfJson;

  if (!bin) throw new Error("GLB has no binary chunk — cannot scale");

  // 1. Compute current AABB (in mm)
  const aabb = computeGlbAABB(gltf, bin);
  const currentDims = aabbSize(aabb);

  if (
    currentDims.width_mm <= 0 ||
    currentDims.height_mm <= 0 ||
    currentDims.depth_mm <= 0
  ) {
    throw new Error("Cannot determine mesh dimensions — bounding box is degenerate");
  }

  // 2. Compute scale factors
  const mode: ScalingMode = spec.mode ?? "proportional";
  const { sx, sy, sz } = scaleFactors(currentDims, spec, mode);

  // 3. Apply scale to positions (in metres, so use sx/sy/sz directly)
  const binCopy = Buffer.from(bin);
  scaleGlbPositions(gltf, binCopy, sx, sy, sz);

  // 4. Rebuild GLB
  const scaled = writeGlbChunks(gltf, binCopy);

  // 5. Measure actual post-scale AABB
  const scaledAABB = computeGlbAABB(gltf, binCopy);
  const actualDimensions = aabbSize(scaledAABB);

  return { buffer: scaled, actualDimensions, format: "glb" };
}

// ---------------------------------------------------------------------------
// Binary STL processing
// ---------------------------------------------------------------------------

/**
 * Binary STL layout:
 *  - 80-byte header
 *  - 4-byte triangle count (uint32 LE)
 *  - N × 50-byte triangles:
 *      12 bytes normal (3 floats)
 *      36 bytes vertices (9 floats, 3×XYZ)
 *      2 bytes attribute byte count
 */

function computeStlAABB(buf: Buffer): AABB {
  const aabb = emptyAABB();
  const triCount = buf.readUInt32LE(80);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    // skip normal (12 bytes)
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(offset + 12 + v * 12);
      const y = buf.readFloatLE(offset + 12 + v * 12 + 4);
      const z = buf.readFloatLE(offset + 12 + v * 12 + 8);
      if (x < aabb.minX) aabb.minX = x;
      if (x > aabb.maxX) aabb.maxX = x;
      if (y < aabb.minY) aabb.minY = y;
      if (y > aabb.maxY) aabb.maxY = y;
      if (z < aabb.minZ) aabb.minZ = z;
      if (z > aabb.maxZ) aabb.maxZ = z;
    }
    offset += 50;
  }
  return aabb;
}

function scaleStl(input: Buffer, sx: number, sy: number, sz: number): Buffer {
  const out = Buffer.from(input);
  const triCount = out.readUInt32LE(80);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    // Rescale normal
    const nx = out.readFloatLE(offset);
    const ny = out.readFloatLE(offset + 4);
    const nz = out.readFloatLE(offset + 8);
    out.writeFloatLE(nx * sx, offset);
    out.writeFloatLE(ny * sy, offset + 4);
    out.writeFloatLE(nz * sz, offset + 8);
    // Rescale vertices
    for (let v = 0; v < 3; v++) {
      const vOff = offset + 12 + v * 12;
      out.writeFloatLE(out.readFloatLE(vOff)     * sx, vOff);
      out.writeFloatLE(out.readFloatLE(vOff + 4) * sy, vOff + 4);
      out.writeFloatLE(out.readFloatLE(vOff + 8) * sz, vOff + 8);
    }
    offset += 50;
  }
  return out;
}

async function scaleStlBuffer(
  input: Buffer,
  spec: DimensionSpec
): Promise<ScaleResult> {
  // STL coordinates are in mm by convention
  const aabb = computeStlAABB(input);
  const currentDims = aabbSize(aabb);

  if (
    currentDims.width_mm <= 0 ||
    currentDims.height_mm <= 0 ||
    currentDims.depth_mm <= 0
  ) {
    throw new Error("STL mesh has degenerate bounding box — cannot scale");
  }

  const mode: ScalingMode = spec.mode ?? "proportional";
  const { sx, sy, sz } = scaleFactors(currentDims, spec, mode);

  const scaled = scaleStl(input, sx, sy, sz);
  const scaledAABB = computeStlAABB(scaled);
  const actualDimensions = aabbSize(scaledAABB);

  return { buffer: scaled, actualDimensions, format: "stl" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a model URL (http/https or data URI) to a Buffer.
 */
async function fetchModelBuffer(modelUrl: string): Promise<Buffer> {
  if (modelUrl.startsWith("data:")) {
    // data:[<mediatype>][;base64],<data>
    const commaIdx = modelUrl.indexOf(",");
    if (commaIdx === -1) throw new Error("Malformed data URI");
    const meta = modelUrl.slice(5, commaIdx);
    const data = modelUrl.slice(commaIdx + 1);
    if (meta.endsWith(";base64")) {
      return Buffer.from(data, "base64");
    }
    return Buffer.from(decodeURIComponent(data));
  }
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Failed to download model from ${modelUrl}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Download a model from a URL, detect its format, scale it to the requested
 * dimensions, and return the result buffer plus measured actual dimensions.
 */
export async function scaleMeshToDimensions(
  modelUrl: string,
  spec: DimensionSpec,
  format: "glb" | "stl"
): Promise<ScaleResult> {
  const input = await fetchModelBuffer(modelUrl);

  if (format === "glb") {
    return scaleGlb(input, spec);
  }
  return scaleStlBuffer(input, spec);
}

/**
 * Scale an already-in-memory buffer. Same as scaleMeshToDimensions but
 * avoids a network round-trip (useful in tests).
 */
export async function scaleBufferToDimensions(
  input: Buffer,
  spec: DimensionSpec,
  format: "glb" | "stl"
): Promise<ScaleResult> {
  if (format === "glb") {
    return scaleGlb(input, spec);
  }
  return scaleStlBuffer(input, spec);
}
