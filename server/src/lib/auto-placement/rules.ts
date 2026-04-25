/**
 * Per-category placement rules used by the auto-placement scorer.
 * Categories follow the homefix_furniture.category enum exactly.
 */

export const FURNITURE_CATEGORIES = [
  "소파",
  "침대",
  "식탁/의자",
  "수납장",
  "TV장",
  "책상",
  "주방가구",
  "욕실가구",
  "기타",
] as const;

export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

export interface CategoryRule {
  /** Prefer flushing the back edge against a wall. */
  wallAlign: boolean;
  /** Required clearance in front of the piece (mm). */
  frontClearanceMm: number;
  /** Encourage placement near the room centroid. */
  allowCenter: boolean;
  /** Categories that score a pairing bonus when within {@link pairWithinMm}. */
  pairWith: FurnitureCategory[];
  pairWithinMm: number;
}

export const RULES: Record<FurnitureCategory, CategoryRule> = {
  "소파":      { wallAlign: true,  frontClearanceMm: 800,  allowCenter: false, pairWith: ["TV장"], pairWithinMm: 4000 },
  "침대":      { wallAlign: true,  frontClearanceMm: 600,  allowCenter: false, pairWith: [],       pairWithinMm: 0 },
  "식탁/의자": { wallAlign: false, frontClearanceMm: 600,  allowCenter: true,  pairWith: [],       pairWithinMm: 0 },
  "수납장":    { wallAlign: true,  frontClearanceMm: 500,  allowCenter: false, pairWith: [],       pairWithinMm: 0 },
  "TV장":      { wallAlign: true,  frontClearanceMm: 1500, allowCenter: false, pairWith: ["소파"], pairWithinMm: 4000 },
  "책상":      { wallAlign: true,  frontClearanceMm: 700,  allowCenter: false, pairWith: [],       pairWithinMm: 0 },
  "주방가구":  { wallAlign: true,  frontClearanceMm: 800,  allowCenter: false, pairWith: [],       pairWithinMm: 0 },
  "욕실가구":  { wallAlign: true,  frontClearanceMm: 600,  allowCenter: false, pairWith: [],       pairWithinMm: 0 },
  "기타":      { wallAlign: false, frontClearanceMm: 500,  allowCenter: true,  pairWith: [],       pairWithinMm: 0 },
};

export function ruleFor(category: FurnitureCategory): CategoryRule {
  return RULES[category] ?? RULES["기타"];
}
