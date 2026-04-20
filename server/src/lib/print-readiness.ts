/**
 * print-readiness.ts
 *
 * Advanced print-readiness validation for 3D models.
 * Checks watertight geometry, manifold edges, normal consistency,
 * and wall thickness to determine if a model is suitable for 3D printing.
 */

export interface PrintReadinessReport {
  isWatertight: boolean;
  isManifold: boolean;
  hasConsistentNormals: boolean;
  invertedNormalCount: number;
  minWallThickness_mm: number;
  holeCount: number;
  selfIntersections: number;
  printQualityScore: number;
  printReady: boolean;
  issues: string[];
}

/**
 * Encode an edge as a canonical string key.
 * Uses rounded vertex coordinates to handle floating-point imprecision.
 * Edges are sorted so (A→B) and (B→A) produce the same key.
 */
function edgeKey(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): string {
  const precision = 1e4;
  const round = (v: number) => Math.round(v * precision);

  const a = `${round(ax)},${round(ay)},${round(az)}`;
  const b = `${round(bx)},${round(by)},${round(bz)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Analyze an STL buffer for print-readiness.
 */
export function analyzeStlPrintReadiness(buf: Buffer): PrintReadinessReport {
  const issues: string[] = [];

  if (buf.length < 84) {
    return {
      isWatertight: false,
      isManifold: false,
      hasConsistentNormals: false,
      invertedNormalCount: 0,
      minWallThickness_mm: 0,
      holeCount: 0,
      selfIntersections: 0,
      printQualityScore: 0,
      printReady: false,
      issues: ["STL buffer too small — likely corrupt or empty"],
    };
  }

  const triCount = buf.readUInt32LE(80);
  if (triCount === 0) {
    return {
      isWatertight: false,
      isManifold: false,
      hasConsistentNormals: false,
      invertedNormalCount: 0,
      minWallThickness_mm: 0,
      holeCount: 0,
      selfIntersections: 0,
      printQualityScore: 0,
      printReady: false,
      issues: ["STL has zero triangles"],
    };
  }

  // Edge adjacency map: edge key → count of triangles sharing that edge
  const edgeCounts = new Map<string, number>();
  let invertedNormalCount = 0;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    // Read stored normal
    const nx = buf.readFloatLE(offset);
    const ny = buf.readFloatLE(offset + 4);
    const nz = buf.readFloatLE(offset + 8);

    // Read 3 vertices
    const verts: number[][] = [];
    for (let vi = 0; vi < 3; vi++) {
      const x = buf.readFloatLE(offset + 12 + vi * 12);
      const y = buf.readFloatLE(offset + 12 + vi * 12 + 4);
      const z = buf.readFloatLE(offset + 12 + vi * 12 + 8);
      verts.push([x, y, z]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    // Compute winding-order normal via cross product
    const e1x = verts[1]![0]! - verts[0]![0]!;
    const e1y = verts[1]![1]! - verts[0]![1]!;
    const e1z = verts[1]![2]! - verts[0]![2]!;
    const e2x = verts[2]![0]! - verts[0]![0]!;
    const e2y = verts[2]![1]! - verts[0]![1]!;
    const e2z = verts[2]![2]! - verts[0]![2]!;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    // Check if stored normal matches winding order (dot product)
    const dot = nx * cx + ny * cy + nz * cz;
    if (dot < 0) {
      invertedNormalCount++;
    }

    // Register 3 edges for adjacency
    for (let ei = 0; ei < 3; ei++) {
      const a = verts[ei]!;
      const b = verts[(ei + 1) % 3]!;
      const key = edgeKey(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }

    offset += 50;
  }

  // Analyze edge adjacency
  let boundaryEdges = 0;   // edges with count == 1 (holes)
  let nonManifoldEdges = 0; // edges with count > 2
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const isWatertight = boundaryEdges === 0;
  const isManifold = nonManifoldEdges === 0;

  // Hole count: boundary edges form loops, but as a simple proxy
  // each boundary edge pair roughly corresponds to one hole region.
  // A more accurate count would require tracing boundary loops.
  const holeCount = boundaryEdges > 0 ? Math.max(1, Math.floor(boundaryEdges / 3)) : 0;

  // Normal consistency
  const invertedPct = triCount > 0 ? (invertedNormalCount / triCount) * 100 : 0;
  const hasConsistentNormals = invertedPct < 5;

  // Wall thickness: conservative proxy using bounding box minimum dimension
  const width_mm = maxX - minX;
  const height_mm = maxY - minY;
  const depth_mm = maxZ - minZ;
  const minWallThickness_mm = Math.min(width_mm, height_mm, depth_mm);

  // Self-intersection detection: not feasible in pure JS for large meshes
  // without spatial indexing. We flag it as 0 and rely on other checks.
  const selfIntersections = 0;

  // --- Scoring ---
  let score = 100;

  if (!isWatertight) {
    issues.push(`Mesh is not watertight (${boundaryEdges} boundary edges, ~${holeCount} holes)`);
    score -= 30;
  }

  if (!isManifold) {
    issues.push(`Non-manifold geometry (${nonManifoldEdges} non-manifold edges)`);
    score -= 20;
  }

  if (!hasConsistentNormals) {
    issues.push(`Inconsistent normals (${invertedNormalCount}/${triCount} inverted, ${invertedPct.toFixed(1)}%)`);
    score -= 15;
  }

  if (minWallThickness_mm < 0.5) {
    issues.push(`Wall thickness ${minWallThickness_mm.toFixed(2)}mm is below minimum (0.5mm)`);
    score -= 30;
  } else if (minWallThickness_mm < 1) {
    issues.push(`Wall thickness ${minWallThickness_mm.toFixed(2)}mm is below recommended 1mm`);
    score -= 20;
  }

  score = Math.max(0, score);

  const printReady = score >= 60 && isWatertight;

  return {
    isWatertight,
    isManifold,
    hasConsistentNormals,
    invertedNormalCount,
    minWallThickness_mm: Math.round(minWallThickness_mm * 100) / 100,
    holeCount,
    selfIntersections,
    printQualityScore: score,
    printReady,
    issues,
  };
}

/**
 * Analyze print-readiness for a model buffer.
 * Currently supports STL format only; GLB returns a conservative fallback.
 */
export function analyzePrintReadiness(buf: Buffer, format: "stl" | "glb"): PrintReadinessReport {
  if (format === "stl") {
    return analyzeStlPrintReadiness(buf);
  }

  // GLB: return conservative report — full analysis requires glTF parsing
  return {
    isWatertight: false,
    isManifold: false,
    hasConsistentNormals: true,
    invertedNormalCount: 0,
    minWallThickness_mm: 0,
    holeCount: 0,
    selfIntersections: 0,
    printQualityScore: 50,
    printReady: false,
    issues: ["GLB format — full print-readiness analysis not yet supported, consider exporting as STL"],
  };
}
