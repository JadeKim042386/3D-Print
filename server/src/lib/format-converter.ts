/**
 * format-converter.ts
 *
 * Pure Node.js 3D model format conversion.
 * Converts between STL, OBJ, GLB (GLTF 2.0 binary), and 3MF formats
 * without heavy dependencies — operates directly on binary buffers.
 */

import { deflateRawSync } from "node:zlib";

export type ExportFormat = "stl" | "obj" | "glb" | "gltf" | "3mf";
export type SourceFormat = "stl" | "glb";

interface Triangle {
  normal: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

interface Mesh {
  vertices: Float32Array; // flat [x,y,z, x,y,z, ...]
  indices: Uint32Array;   // triangle indices
}

// ---------------------------------------------------------------------------
// STL parsing
// ---------------------------------------------------------------------------

function parseStl(buf: Buffer): Triangle[] {
  const triCount = buf.readUInt32LE(80);
  const triangles: Triangle[] = [];
  let offset = 84;

  for (let i = 0; i < triCount; i++) {
    const nx = buf.readFloatLE(offset);
    const ny = buf.readFloatLE(offset + 4);
    const nz = buf.readFloatLE(offset + 8);

    const v1: [number, number, number] = [
      buf.readFloatLE(offset + 12),
      buf.readFloatLE(offset + 16),
      buf.readFloatLE(offset + 20),
    ];
    const v2: [number, number, number] = [
      buf.readFloatLE(offset + 24),
      buf.readFloatLE(offset + 28),
      buf.readFloatLE(offset + 32),
    ];
    const v3: [number, number, number] = [
      buf.readFloatLE(offset + 36),
      buf.readFloatLE(offset + 40),
      buf.readFloatLE(offset + 44),
    ];

    triangles.push({ normal: [nx, ny, nz], v1, v2, v3 });
    offset += 50;
  }
  return triangles;
}

function stlToMesh(buf: Buffer): Mesh {
  const triangles = parseStl(buf);
  const vertexMap = new Map<string, number>();
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const tri of triangles) {
    for (const v of [tri.v1, tri.v2, tri.v3]) {
      const key = `${v[0]},${v[1]},${v[2]}`;
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = vertices.length / 3;
        vertexMap.set(key, idx);
        vertices.push(v[0], v[1], v[2]);
      }
      indices.push(idx);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

// ---------------------------------------------------------------------------
// GLB parsing → Mesh
// ---------------------------------------------------------------------------

function readGlbChunks(buf: Buffer): { json: Record<string, unknown>; bin: Buffer | null } {
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error("Not a valid GLB file");

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
      json = JSON.parse(chunkData.toString("utf8")) as Record<string, unknown>;
    } else if (chunkType === 0x004E4942) {
      bin = Buffer.from(chunkData);
    }
  }

  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

const ACCESSOR_ELEMENT_COUNTS: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4,
};

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfMesh {
  primitives: Array<{
    attributes: Record<string, number>;
    indices?: number;
  }>;
}

interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  meshes?: GltfMesh[];
  [key: string]: unknown;
}

function readAccessorFloat32(gltf: GltfJson, bin: Buffer, idx: number): Float32Array {
  const acc = gltf.accessors![idx]!;
  const numComp = ACCESSOR_ELEMENT_COUNTS[acc.type] ?? 1;
  const bv = gltf.bufferViews![acc.bufferView ?? 0]!;
  const stride = bv.byteStride ?? numComp * 4;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);

  const result = new Float32Array(acc.count * numComp);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < numComp; c++) {
      result[i * numComp + c] = bin.readFloatLE(base + i * stride + c * 4);
    }
  }
  return result;
}

function readAccessorIndices(gltf: GltfJson, bin: Buffer, idx: number): Uint32Array {
  const acc = gltf.accessors![idx]!;
  const bv = gltf.bufferViews![acc.bufferView ?? 0]!;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const result = new Uint32Array(acc.count);

  for (let i = 0; i < acc.count; i++) {
    switch (acc.componentType) {
      case 5121: // UNSIGNED_BYTE
        result[i] = bin.readUInt8(base + i);
        break;
      case 5123: // UNSIGNED_SHORT
        result[i] = bin.readUInt16LE(base + i * 2);
        break;
      case 5125: // UNSIGNED_INT
        result[i] = bin.readUInt32LE(base + i * 4);
        break;
      default:
        throw new Error(`Unsupported index componentType: ${acc.componentType}`);
    }
  }
  return result;
}

function glbToMesh(buf: Buffer): Mesh {
  const { json, bin } = readGlbChunks(buf);
  if (!bin) throw new Error("GLB has no binary chunk");
  const gltf = json as GltfJson;
  if (!gltf.meshes?.length) throw new Error("GLB has no meshes");

  const allVertices: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes["POSITION"];
      if (posIdx == null) continue;

      // GLTF positions are in metres → convert to mm
      const pos = readAccessorFloat32(gltf, bin, posIdx);
      for (let i = 0; i < pos.length; i++) {
        allVertices.push(pos[i]! * 1000);
      }

      if (prim.indices != null) {
        const indices = readAccessorIndices(gltf, bin, prim.indices);
        for (let i = 0; i < indices.length; i++) {
          allIndices.push(indices[i]! + vertexOffset);
        }
      } else {
        // Non-indexed: sequential
        const count = pos.length / 3;
        for (let i = 0; i < count; i++) {
          allIndices.push(vertexOffset + i);
        }
      }

      vertexOffset += pos.length / 3;
    }
  }

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices),
  };
}

// ---------------------------------------------------------------------------
// Output format writers
// ---------------------------------------------------------------------------

function computeNormal(
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number]
): [number, number, number] {
  const ax = v2[0] - v1[0], ay = v2[1] - v1[1], az = v2[2] - v1[2];
  const bx = v3[0] - v1[0], by = v3[1] - v1[1], bz = v3[2] - v1[2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Mesh → binary STL (mm units) */
function meshToStl(mesh: Mesh): Buffer {
  const triCount = mesh.indices.length / 3;
  const buf = Buffer.alloc(84 + triCount * 50);

  // Header
  buf.write("Binary STL exported by DPR-3D", 0, 80, "ascii");
  buf.writeUInt32LE(triCount, 80);

  let offset = 84;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i]! * 3;
    const i1 = mesh.indices[i + 1]! * 3;
    const i2 = mesh.indices[i + 2]! * 3;

    const v1: [number, number, number] = [mesh.vertices[i0]!, mesh.vertices[i0 + 1]!, mesh.vertices[i0 + 2]!];
    const v2: [number, number, number] = [mesh.vertices[i1]!, mesh.vertices[i1 + 1]!, mesh.vertices[i1 + 2]!];
    const v3: [number, number, number] = [mesh.vertices[i2]!, mesh.vertices[i2 + 1]!, mesh.vertices[i2 + 2]!];
    const n = computeNormal(v1, v2, v3);

    buf.writeFloatLE(n[0], offset);
    buf.writeFloatLE(n[1], offset + 4);
    buf.writeFloatLE(n[2], offset + 8);

    buf.writeFloatLE(v1[0], offset + 12);
    buf.writeFloatLE(v1[1], offset + 16);
    buf.writeFloatLE(v1[2], offset + 20);

    buf.writeFloatLE(v2[0], offset + 24);
    buf.writeFloatLE(v2[1], offset + 28);
    buf.writeFloatLE(v2[2], offset + 32);

    buf.writeFloatLE(v3[0], offset + 36);
    buf.writeFloatLE(v3[1], offset + 40);
    buf.writeFloatLE(v3[2], offset + 44);

    buf.writeUInt16LE(0, offset + 48); // attribute byte count
    offset += 50;
  }
  return buf;
}

/** Mesh → OBJ text (mm units) */
function meshToObj(mesh: Mesh): Buffer {
  const lines: string[] = [
    "# OBJ exported by DPR-3D",
    "# Units: millimeters",
    "",
  ];

  // Vertices
  const vertCount = mesh.vertices.length / 3;
  for (let i = 0; i < vertCount; i++) {
    const x = mesh.vertices[i * 3]!;
    const y = mesh.vertices[i * 3 + 1]!;
    const z = mesh.vertices[i * 3 + 2]!;
    lines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
  }

  lines.push("");

  // Compute and write normals per face
  const triCount = mesh.indices.length / 3;
  const normals: [number, number, number][] = [];

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i]! * 3;
    const i1 = mesh.indices[i + 1]! * 3;
    const i2 = mesh.indices[i + 2]! * 3;

    const v1: [number, number, number] = [mesh.vertices[i0]!, mesh.vertices[i0 + 1]!, mesh.vertices[i0 + 2]!];
    const v2: [number, number, number] = [mesh.vertices[i1]!, mesh.vertices[i1 + 1]!, mesh.vertices[i1 + 2]!];
    const v3: [number, number, number] = [mesh.vertices[i2]!, mesh.vertices[i2 + 1]!, mesh.vertices[i2 + 2]!];
    const n = computeNormal(v1, v2, v3);
    normals.push(n);
    lines.push(`vn ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}`);
  }

  lines.push("", "g model", "");

  // Faces (OBJ uses 1-based indices)
  for (let i = 0; i < triCount; i++) {
    const a = mesh.indices[i * 3]! + 1;
    const b = mesh.indices[i * 3 + 1]! + 1;
    const c = mesh.indices[i * 3 + 2]! + 1;
    const ni = i + 1;
    lines.push(`f ${a}//${ni} ${b}//${ni} ${c}//${ni}`);
  }

  lines.push("");
  return Buffer.from(lines.join("\n"), "utf8");
}

/** Mesh → GLB binary (positions in metres for GLTF spec) */
function meshToGlb(mesh: Mesh): Buffer {
  // Convert vertices from mm to metres for GLTF
  const positions = new Float32Array(mesh.vertices.length);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const x = mesh.vertices[i]! / 1000;
    const y = mesh.vertices[i + 1]! / 1000;
    const z = mesh.vertices[i + 2]! / 1000;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Build binary buffer: indices (uint32) + positions (float32)
  const indicesBytes = mesh.indices.length * 4;
  const positionsBytes = positions.length * 4;
  // Pad indices to 4-byte boundary (already uint32, so aligned)
  const binLength = indicesBytes + positionsBytes;
  const bin = Buffer.alloc(binLength);

  for (let i = 0; i < mesh.indices.length; i++) {
    bin.writeUInt32LE(mesh.indices[i]!, i * 4);
  }
  for (let i = 0; i < positions.length; i++) {
    bin.writeFloatLE(positions[i]!, indicesBytes + i * 4);
  }

  const gltf = {
    asset: { version: "2.0", generator: "DPR-3D Exporter" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 1 },
        indices: 0,
      }],
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5125, // UNSIGNED_INT
        count: mesh.indices.length,
        type: "SCALAR",
        max: [Math.max(...mesh.indices)],
        min: [0],
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: indicesBytes,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: indicesBytes,
        byteLength: positionsBytes,
        target: 34962, // ARRAY_BUFFER
      },
    ],
    buffers: [{ byteLength: binLength }],
  };

  // Assemble GLB
  const jsonStr = JSON.stringify(gltf);
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0x00)]);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic "glTF"
  header.writeUInt32LE(2, 4);           // version
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4); // JSON

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004E4942, 4); // BIN

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

// ---------------------------------------------------------------------------
// 3MF writer (ZIP with XML)
// ---------------------------------------------------------------------------

/** Create a minimal ZIP archive from entries (no compression for simplicity & speed) */
function createZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);

    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);  // version needed
    local.writeUInt16LE(0, 6);   // flags
    local.writeUInt16LE(8, 8);   // compression (deflate)
    local.writeUInt16LE(0, 10);  // mod time
    local.writeUInt16LE(0, 12);  // mod date

    // CRC-32
    const crc = crc32(entry.data);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(entry.data.length, 22);  // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    parts.push(local, nameBytes, compressed);

    // Central directory entry
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);  // version made by
    central.writeUInt16LE(20, 6);  // version needed
    central.writeUInt16LE(0, 8);   // flags
    central.writeUInt16LE(8, 10);  // compression (deflate)
    central.writeUInt16LE(0, 12);  // mod time
    central.writeUInt16LE(0, 14);  // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centralDirectory.push(central, nameBytes);

    offset += 30 + nameBytes.length + compressed.length;
  }

  const cdOffset = offset;
  const cdParts = Buffer.concat(centralDirectory);
  const cdSize = cdParts.length;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);  // disk number
  eocd.writeUInt16LE(0, 6);  // cd disk number
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...parts, cdParts, eocd]);
}

/** Simple CRC-32 implementation */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Mesh → 3MF (ZIP package with XML model) */
function meshTo3mf(mesh: Mesh): Buffer {
  const vertCount = mesh.vertices.length / 3;
  const triCount = mesh.indices.length / 3;

  // Build vertices XML
  const vertexLines: string[] = [];
  for (let i = 0; i < vertCount; i++) {
    const x = mesh.vertices[i * 3]!;
    const y = mesh.vertices[i * 3 + 1]!;
    const z = mesh.vertices[i * 3 + 2]!;
    vertexLines.push(`        <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Build triangles XML
  const triangleLines: string[] = [];
  for (let i = 0; i < triCount; i++) {
    const v1 = mesh.indices[i * 3]!;
    const v2 = mesh.indices[i * 3 + 1]!;
    const v3 = mesh.indices[i * 3 + 2]!;
    triangleLines.push(`        <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vertexLines.join("\n")}
        </vertices>
        <triangles>
${triangleLines.join("\n")}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "3D/3dmodel.model", data: Buffer.from(modelXml, "utf8") },
  ]);
}

// ---------------------------------------------------------------------------
// Public conversion API
// ---------------------------------------------------------------------------

/**
 * Convert a 3D model buffer from one format to another.
 * Source must be STL or GLB (the two formats our generation pipeline produces).
 * Target can be any of: stl, obj, glb, gltf, 3mf.
 */
export function convertModel(
  source: Buffer,
  sourceFormat: SourceFormat,
  targetFormat: ExportFormat
): Buffer {
  // Identity conversion: return source as-is
  if (sourceFormat === targetFormat) return source;
  // gltf target from glb source: same (GLB is binary GLTF)
  if (sourceFormat === "glb" && targetFormat === "gltf") return source;

  // Parse source to intermediate mesh
  const mesh = sourceFormat === "stl" ? stlToMesh(source) : glbToMesh(source);

  switch (targetFormat) {
    case "stl":
      return meshToStl(mesh);
    case "obj":
      return meshToObj(mesh);
    case "glb":
    case "gltf":
      return meshToGlb(mesh);
    case "3mf":
      return meshTo3mf(mesh);
    default:
      throw new Error(`Unsupported target format: ${targetFormat}`);
  }
}
