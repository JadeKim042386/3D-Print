/**
 * dimension-refit.ts
 *
 * Computes proportionally adjusted dimensions when a user modifies
 * certain dimensions of an existing model. The whole model re-fits
 * proportionally so the design stays coherent.
 *
 * Example:
 *   Original:  80mm × 60mm × 40mm  (ratio 4:3:2)
 *   User sets: width_mm = 100mm
 *   Result:    100mm × 75mm × 50mm  (ratio preserved)
 *
 * When the user provides all three dimensions explicitly, they are
 * used as-is (the user is overriding proportionality intentionally).
 */

import type { MeshDimensions } from "../types/generation.js";

export interface RefitInput {
  /** Original model dimensions (from the initial generation) */
  original: MeshDimensions;

  /**
   * Partial dimension update from the user.
   * Omitted fields are auto-computed to preserve the original aspect ratio.
   */
  updated: {
    width_mm?:  number;
    height_mm?: number;
    depth_mm?:  number;
  };
}

export interface RefitResult {
  /** Final refitted dimensions (all three populated) */
  dimensions: MeshDimensions;
  /**
   * The uniform scale factor applied.
   * null if the user provided all three dimensions (no proportional scaling).
   */
  uniformScale: number | null;
}

/**
 * Compute refitted dimensions maintaining proportional coherence.
 *
 * Strategy:
 *   - If the user provides 1 dimension: compute a uniform scale factor
 *     from that axis and apply to all three.
 *   - If the user provides 2 dimensions: compute the scale factor from
 *     the average of the two changed ratios and apply to the missing one.
 *   - If the user provides all 3 dimensions: use them as-is (explicit override).
 */
export function computeRefitDimensions(input: RefitInput): RefitResult {
  const { original, updated } = input;

  const wProvided = updated.width_mm  != null;
  const hProvided = updated.height_mm != null;
  const dProvided = updated.depth_mm  != null;
  const providedCount = +wProvided + +hProvided + +dProvided;

  // All three provided — user is overriding proportionality intentionally
  if (providedCount === 3) {
    return {
      dimensions: {
        width_mm:  updated.width_mm!,
        height_mm: updated.height_mm!,
        depth_mm:  updated.depth_mm!,
      },
      uniformScale: null,
    };
  }

  // No dimensions provided — return original unchanged
  if (providedCount === 0) {
    return {
      dimensions: { ...original },
      uniformScale: 1,
    };
  }

  // Compute scale factor(s) from the dimension(s) that were changed
  const scales: number[] = [];
  if (wProvided) scales.push(updated.width_mm!  / (original.width_mm  || 1));
  if (hProvided) scales.push(updated.height_mm! / (original.height_mm || 1));
  if (dProvided) scales.push(updated.depth_mm!  / (original.depth_mm  || 1));

  // Use the average of provided scale ratios as the uniform scale
  const uniformScale = scales.reduce((a, b) => a + b, 0) / scales.length;

  return {
    dimensions: {
      width_mm:  wProvided ? updated.width_mm!  : original.width_mm  * uniformScale,
      height_mm: hProvided ? updated.height_mm! : original.height_mm * uniformScale,
      depth_mm:  dProvided ? updated.depth_mm!  : original.depth_mm  * uniformScale,
    },
    uniformScale,
  };
}
