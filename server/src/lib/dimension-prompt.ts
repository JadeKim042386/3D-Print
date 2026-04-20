/**
 * dimension-prompt.ts
 *
 * Builds dimension-aware generation prompts for organic / artistic shapes.
 *
 * When users specify exact physical dimensions alongside a creative prompt,
 * we must tell the AI *design* provider (Meshy, etc.) what physical size the
 * object should be from the outset — so the model is designed proportionally
 * for those dimensions, not generated at an arbitrary scale and squashed later.
 *
 * This is the correct approach for non-geometric shapes (mugs, animals,
 * figurines, etc.) where post-scale would distort wall thickness, feature
 * sizes, and overall design intent.
 */

import type { DimensionSpec } from "../types/generation.js";

/**
 * Enrich a user's text prompt with physical dimension constraints.
 *
 * The resulting prompt guides the AI to:
 *   1. Design the object with proportions appropriate for the specified size
 *   2. Set wall thickness, detail level, and features for this physical scale
 *   3. Produce a print-ready model suitable for FDM at that size
 *
 * @param userPrompt   The original user description
 * @param dimensions   Requested physical dimensions in mm
 * @returns            Enriched prompt to send to the generation provider
 */
export function buildDimensionAwarePrompt(
  userPrompt: string,
  dimensions: DimensionSpec
): string {
  const { width_mm: w, height_mm: h, depth_mm: d } = dimensions;

  // Format each dimension as a readable measurement
  const wLabel = formatMm(w);
  const hLabel = formatMm(h);
  const dLabel = formatMm(d);

  // Determine the dominant dimension for scale context
  const maxDim = Math.max(w, h, d);
  const sizeContext = describeSizeContext(maxDim);

  return [
    userPrompt.trim().replace(/[.,;]?\s*$/, ""),
    `,`,
    `precisely designed for exact physical dimensions:`,
    `${wLabel} wide × ${hLabel} tall × ${dLabel} deep.`,
    `All structural features, wall thickness, and proportions must be appropriate`,
    `for a ${sizeContext} object of this exact size.`,
    `Optimised for FDM 3D printing with no overhangs exceeding 45 degrees,`,
    `sufficient wall thickness for structural integrity at this scale.`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMm(mm: number): string {
  if (mm >= 10) return `${Math.round(mm)}mm`;
  return `${mm.toFixed(1)}mm`;
}

/**
 * Return a human-readable size context phrase so the AI has a real-world
 * reference frame (e.g. "small desktop" vs "large display").
 */
function describeSizeContext(maxDimMm: number): string {
  if (maxDimMm <= 30)  return "very small (fingertip-sized)";
  if (maxDimMm <= 80)  return "small (palm-sized)";
  if (maxDimMm <= 150) return "medium (desk-item-sized)";
  if (maxDimMm <= 300) return "large (book-sized)";
  return "very large";
}

/**
 * Build a Korean-language dimension context string for UI display.
 * (Not sent to the provider — used in frontend confirmation copy.)
 */
export function formatDimensionsKorean(dimensions: DimensionSpec): string {
  const { width_mm: w, height_mm: h, depth_mm: d } = dimensions;
  return `가로 ${Math.round(w)}mm × 높이 ${Math.round(h)}mm × 깊이 ${Math.round(d)}mm`;
}
