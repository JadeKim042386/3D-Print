/**
 * dimension-validator.ts
 *
 * Validates that a scaled mesh's actual dimensions match the user's requested
 * dimensions within a configurable tolerance. Returns a structured result that
 * includes an accuracy percentage and a pass/fail flag.
 */

import type { DimensionSpec, MeshDimensions, DimensionResult } from "../types/generation.js";

/** Default tolerance: ±0.5 mm absolute error */
const DEFAULT_TOLERANCE_MM = 0.5;

/**
 * Compute the dimensional accuracy result given what was requested and what
 * was measured after scaling.
 *
 * @param requested  The DimensionSpec the user passed in
 * @param actual     The AABB dimensions measured from the post-scaled mesh
 * @param toleranceMm  Max allowed absolute error per axis (default 0.5 mm)
 */
export function validateDimensions(
  requested: DimensionSpec,
  actual: MeshDimensions,
  toleranceMm: number = DEFAULT_TOLERANCE_MM
): DimensionResult {
  const req: MeshDimensions = {
    width_mm: requested.width_mm,
    height_mm: requested.height_mm,
    depth_mm: requested.depth_mm,
  };

  const errorX = Math.abs(actual.width_mm  - req.width_mm);
  const errorY = Math.abs(actual.height_mm - req.height_mm);
  const errorZ = Math.abs(actual.depth_mm  - req.depth_mm);

  const max_error_mm = Math.max(errorX, errorY, errorZ);

  // Accuracy as percentage: perfect = 100, scales down with error relative to
  // the largest requested dimension (so a 1 mm error on a 200 mm part is 99.5%).
  const largestDim = Math.max(req.width_mm, req.height_mm, req.depth_mm, 1);
  const accuracy_pct = Math.max(0, (1 - max_error_mm / largestDim) * 100);

  const passed = max_error_mm <= toleranceMm;

  return {
    requested: req,
    actual,
    accuracy_pct: Math.round(accuracy_pct * 100) / 100,
    max_error_mm: Math.round(max_error_mm * 1000) / 1000,
    passed,
  };
}

/**
 * Tolerance thresholds by object size for print-quality validation.
 * Larger objects tolerate slightly more absolute error.
 */
export function toleranceForSize(maxDimMm: number): number {
  if (maxDimMm <= 50)  return 0.3;   // tiny objects: tighter tolerance
  if (maxDimMm <= 200) return 0.5;   // standard tolerance
  return 1.0;                         // large objects: 1 mm is acceptable
}
