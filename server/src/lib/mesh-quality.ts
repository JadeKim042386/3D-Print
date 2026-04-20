/**
 * mesh-quality.ts
 *
 * Mesh quality analysis for 3D printing readiness.
 * Evaluates key metrics that affect printability:
 *
 *   - Triangle count (mesh resolution/detail)
 *   - Bounding box dimensions (printable size)
 *   - Aspect ratio analysis (extreme ratios = print issues)
 *   - Degenerate triangle detection (zero-area faces)
 *   - Vertex count estimation
 *
 * These metrics provide qualitative evaluation alongside the
 * quantitative dimensional accuracy scores.
 */

export interface MeshQualityReport {
  format: "stl" | "glb";
  triangleCount: number;
  vertexCount: number;
  boundingBox: {
    width_mm: number;
    height_mm: number;
    depth_mm: number;
  };
  volume_mm3: number | null;
  surfaceArea_mm2: number | null;
  degenerateTriangles: number;
  aspectRatio: number;
  printabilityScore: number;
  warnings: string[];
}

/**
 * Analyze an STL buffer for mesh quality metrics.
 */
export function analyzeStlQuality(buf: Buffer): MeshQualityReport {
  const warnings: string[] = [];

  if (buf.length < 84) {
    return {
      format: "stl",
      triangleCount: 0,
      vertexCount: 0,
      boundingBox: { width_mm: 0, height_mm: 0, depth_mm: 0 },
      volume_mm3: null,
      surfaceArea_mm2: null,
      degenerateTriangles: 0,
      aspectRatio: 0,
      printabilityScore: 0,
      warnings: ["STL buffer too small — likely corrupt or empty"],
    };
  }

  const triCount = buf.readUInt32LE(80);
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let degenerateCount = 0;
  let totalSurfaceArea = 0;
  let totalSignedVolume = 0;

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    // Read vertices
    const v: number[][] = [];
    for (let vi = 0; vi < 3; vi++) {
      const x = buf.readFloatLE(offset + 12 + vi * 12);
      const y = buf.readFloatLE(offset + 12 + vi * 12 + 4);
      const z = buf.readFloatLE(offset + 12 + vi * 12 + 8);
      v.push([x, y, z]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    // Edge vectors
    const e1 = [v[1]![0]! - v[0]![0]!, v[1]![1]! - v[0]![1]!, v[1]![2]! - v[0]![2]!];
    const e2 = [v[2]![0]! - v[0]![0]!, v[2]![1]! - v[0]![1]!, v[2]![2]! - v[0]![2]!];

    // Cross product
    const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;

    const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    totalSurfaceArea += area;

    // Degenerate check (zero or near-zero area)
    if (area < 1e-10) {
      degenerateCount++;
    }

    // Signed volume contribution (for closed meshes)
    const v0 = v[0]!;
    const v1 = v[1]!;
    const v2 = v[2]!;
    totalSignedVolume += (
      v0[0]! * (v1[1]! * v2[2]! - v1[2]! * v2[1]!) +
      v0[1]! * (v1[2]! * v2[0]! - v1[0]! * v2[2]!) +
      v0[2]! * (v1[0]! * v2[1]! - v1[1]! * v2[0]!)
    ) / 6;

    offset += 50;
  }

  const width_mm = maxX - minX;
  const height_mm = maxY - minY;
  const depth_mm = maxZ - minZ;

  // Aspect ratio: ratio of largest to smallest dimension
  const dims = [width_mm, height_mm, depth_mm].sort((a, b) => a - b);
  const aspectRatio = dims[0]! > 0 ? dims[2]! / dims[0]! : Infinity;

  // Volume (absolute value, may not be exact for non-manifold meshes)
  const volume = Math.abs(totalSignedVolume);

  // Printability scoring
  let printabilityScore = 100;

  if (triCount < 12) {
    warnings.push("Very low triangle count — model may lack detail");
    printabilityScore -= 30;
  } else if (triCount < 100) {
    warnings.push("Low triangle count — model may appear faceted");
    printabilityScore -= 10;
  }

  if (degenerateCount > 0) {
    const pct = (degenerateCount / triCount) * 100;
    warnings.push(`${degenerateCount} degenerate triangles (${pct.toFixed(1)}%)`);
    printabilityScore -= Math.min(30, degenerateCount * 2);
  }

  if (aspectRatio > 20) {
    warnings.push(`Extreme aspect ratio (${aspectRatio.toFixed(1)}:1) — may cause print issues`);
    printabilityScore -= 15;
  } else if (aspectRatio > 10) {
    warnings.push(`High aspect ratio (${aspectRatio.toFixed(1)}:1)`);
    printabilityScore -= 5;
  }

  const minDim = Math.min(width_mm, height_mm, depth_mm);
  if (minDim < 0.5) {
    warnings.push(`Minimum dimension ${minDim.toFixed(2)}mm may be too thin to print`);
    printabilityScore -= 20;
  } else if (minDim < 1) {
    warnings.push(`Minimum dimension ${minDim.toFixed(2)}mm is at the print threshold`);
    printabilityScore -= 5;
  }

  printabilityScore = Math.max(0, printabilityScore);

  return {
    format: "stl",
    triangleCount: triCount,
    vertexCount: triCount * 3,
    boundingBox: { width_mm, height_mm, depth_mm },
    volume_mm3: volume > 0 ? Math.round(volume * 100) / 100 : null,
    surfaceArea_mm2: totalSurfaceArea > 0 ? Math.round(totalSurfaceArea * 100) / 100 : null,
    degenerateTriangles: degenerateCount,
    aspectRatio: Math.round(aspectRatio * 100) / 100,
    printabilityScore,
    warnings,
  };
}
