/**
 * shape-classifier.ts
 *
 * Classifies a user's text prompt to determine which generation strategy
 * to use for dimensional accuracy:
 *
 *   "parametric" — geometry can be described mathematically; bypass AI and
 *                  generate an exact STL from constructive geometry.
 *
 *   "organic"    — creative / artistic shape that needs AI generation; we
 *                  inject dimension constraints into the prompt so the model
 *                  is *designed* at the correct size, then apply fine-tune
 *                  scale correction for any residual drift.
 */

export type ShapeCategory = "parametric" | "organic";

export interface ClassificationResult {
  category: ShapeCategory;
  /** The best-matching parametric type (only set when category = "parametric") */
  parametricType?: ParametricType;
  /** Confidence score 0–1 */
  confidence: number;
}

export type ParametricType =
  | "box"
  | "cylinder"
  | "tube"
  | "plate"
  | "bracket"
  | "stand";

// ---------------------------------------------------------------------------
// Keyword maps per parametric type
// ---------------------------------------------------------------------------

const PARAMETRIC_KEYWORDS: Record<ParametricType, string[]> = {
  box: [
    "box", "cube", "rectangular box", "square box", "enclosure", "case",
    "container", "storage box", "housing", "casing", "drawer", "tray",
    "상자", "박스", "케이스", "수납함",
  ],
  cylinder: [
    "cylinder", "cylindrical", "column", "pillar", "disk", "disc",
    "원통", "기둥", "실린더",
  ],
  tube: [
    "tube", "pipe", "hollow cylinder", "ring", "annulus", "sleeve",
    "파이프", "관", "튜브",
  ],
  plate: [
    "plate", "slab", "flat plate", "tile", "panel", "sheet", "board",
    "plaque", "flat piece", "flat part", "base plate",
    "판", "플레이트", "타일", "패널",
  ],
  bracket: [
    "bracket", "l-bracket", "angle bracket", "wall mount", "mounting bracket",
    "shelf bracket", "support bracket", "corner bracket",
    "브라켓", "꺾쇠", "마운트",
  ],
  stand: [
    "stand", "pedestal", "riser", "base", "platform", "phone stand",
    "monitor stand", "laptop stand", "display stand", "holder",
    "받침대", "스탠드", "거치대",
  ],
};

// Words that strongly suggest organic/creative content — override parametric match
const ORGANIC_OVERRIDES: string[] = [
  "animal", "creature", "character", "figure", "figurine", "person", "human",
  "face", "head", "skull", "dragon", "monster", "robot", "spaceship",
  "flower", "tree", "leaf", "wave", "organic", "sculpture", "art",
  "mug", "cup", "vase", "bowl", "jug", "bottle", "pot",
  "동물", "캐릭터", "인형", "피규어", "꽃", "나무",
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a user prompt to determine the best generation strategy.
 *
 * Rules (in priority order):
 *  1. If any organic-override keyword matches → "organic" (even if parametric keywords also match)
 *  2. If any parametric keyword matches → "parametric" with the matched type
 *  3. Default → "organic" (AI is always safe for unknown shapes)
 */
export function classifyShape(prompt: string): ClassificationResult {
  const lower = prompt.toLowerCase();

  // Rule 1: organic override
  for (const word of ORGANIC_OVERRIDES) {
    if (lower.includes(word)) {
      return { category: "organic", confidence: 0.9 };
    }
  }

  // Rule 2: parametric keyword match
  const scores: Partial<Record<ParametricType, number>> = {};
  for (const [type, keywords] of Object.entries(PARAMETRIC_KEYWORDS) as [ParametricType, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[type] = (scores[type] ?? 0) + 1;
      }
    }
  }

  const entries = Object.entries(scores) as [ParametricType, number][];
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1]);
    const [bestType, bestScore] = entries[0]!;
    return {
      category: "parametric",
      parametricType: bestType,
      confidence: Math.min(0.5 + bestScore * 0.1, 0.95),
    };
  }

  // Default: treat as organic
  return { category: "organic", confidence: 0.5 };
}
