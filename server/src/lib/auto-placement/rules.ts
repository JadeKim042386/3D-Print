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

const CATEGORY_ALIASES: Record<string, FurnitureCategory> = {
  // Korean canonical (passthrough)
  "소파": "소파",
  "침대": "침대",
  "식탁/의자": "식탁/의자",
  "수납장": "수납장",
  "TV장": "TV장",
  "책상": "책상",
  "주방가구": "주방가구",
  "욕실가구": "욕실가구",
  "기타": "기타",
  // Korean loose forms
  "의자": "식탁/의자",
  "테이블": "식탁/의자",
  "식탁": "식탁/의자",
  "수납": "수납장",
  "tv": "TV장",
  "tv장": "TV장",
  // English aliases (catalog seed currently uses these)
  "sofa": "소파",
  "couch": "소파",
  "bed": "침대",
  "table": "식탁/의자",
  "chair": "식탁/의자",
  "dining": "식탁/의자",
  "desk": "책상",
  "storage": "수납장",
  "shelf": "수납장",
  "wardrobe": "수납장",
  "kitchen": "주방가구",
  "bath": "욕실가구",
  "bathroom": "욕실가구",
  "other": "기타",
  "etc": "기타",
};

/**
 * Normalize a raw catalog category string to a canonical {@link FurnitureCategory}.
 * Handles English aliases (sofa, chair, …), loose Korean (의자, tv) and case.
 * Returns `"기타"` as a safe fallback so previously-unrecognised items still place.
 */
export function normalizeFurnitureCategory(raw: string): FurnitureCategory {
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[raw.trim()] ?? "기타";
}
