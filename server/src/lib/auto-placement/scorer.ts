/**
 * Soft-constraint scorer for the auto-placement algorithm.
 * Each sub-score is in [0, 1]; the final score is a weighted sum.
 */

import {
  type Vec2,
  type Obb,
  obbCorners,
  obbOverlap,
  makeFurnitureObb,
  distancePointToSegment,
  polygonCentroid,
} from "./geometry.js";
import { type FurnitureCategory, ruleFor } from "./rules.js";

export interface ExistingItem {
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
  width_mm: number;
  depth_mm: number;
  category: FurnitureCategory;
}

export interface CandidatePose {
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
}

export interface ScoreContext {
  poly: Vec2[];
  walls: Array<{ a: Vec2; b: Vec2; angleDeg: number; lengthMm: number }>;
  centroid: Vec2;
  diagonalMm: number;
  candidate: {
    width_mm: number;
    depth_mm: number;
    category: FurnitureCategory;
  };
  existing: ExistingItem[];
}

export interface SubScores {
  wallAffinity: number;
  frontClearance: number;
  centerBias: number;
  pairingBonus: number;
  axisAlign: number;
  neighborSpacing: number;
}

export interface ScoredPose extends CandidatePose {
  score: number;
  reasons: string[];
}

const WEIGHTS: Record<keyof SubScores, number> = {
  wallAffinity: 0.30,
  frontClearance: 0.25,
  centerBias: 0.10,
  pairingBonus: 0.20,
  axisAlign: 0.10,
  neighborSpacing: 0.05,
};

const BACK_EDGE_TOUCH_THRESHOLD_MM = 80;

export function scorePose(pose: CandidatePose, ctx: ScoreContext): ScoredPose {
  const rule = ruleFor(ctx.candidate.category);
  const obb = makeFurnitureObb(
    pose.x_mm,
    pose.y_mm,
    pose.rotation_deg,
    ctx.candidate.width_mm,
    ctx.candidate.depth_mm,
  );
  const corners = obbCorners(obb);

  const subs: SubScores = {
    wallAffinity: scoreWallAffinity(corners, ctx.walls, rule.wallAlign),
    frontClearance: scoreFrontClearance(obb, ctx, rule.frontClearanceMm),
    centerBias: scoreCenterBias(pose, ctx, rule.allowCenter),
    pairingBonus: scorePairing(pose, ctx, rule.pairWith, rule.pairWithinMm),
    axisAlign: scoreAxisAlign(pose.rotation_deg, ctx.walls),
    neighborSpacing: scoreNeighborSpacing(obb, ctx.existing),
  };

  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof SubScores, number]>) {
    total += subs[key] * weight;
  }

  const reasons: string[] = [];
  if (subs.wallAffinity > 0.5) reasons.push("wall-aligned");
  if (subs.frontClearance > 0.8) reasons.push("front clearance ok");
  if (subs.pairingBonus > 0.5) reasons.push("near paired furniture");
  if (subs.centerBias > 0.5) reasons.push("centered");

  return { ...pose, score: clamp01(total), reasons };
}

/** Back edge of the OBB (between corners 0 and 1) close to a wall? */
function scoreWallAffinity(
  corners: Vec2[],
  walls: ScoreContext["walls"],
  wantWall: boolean,
): number {
  if (!wantWall) return 0.5; // neutral for free-standing categories
  const back: [Vec2, Vec2] = [corners[0]!, corners[1]!];
  const mid: Vec2 = {
    x_mm: (back[0].x_mm + back[1].x_mm) / 2,
    y_mm: (back[0].y_mm + back[1].y_mm) / 2,
  };
  let bestDist = Infinity;
  for (const w of walls) {
    const d = distancePointToSegment(mid, w.a, w.b);
    if (d < bestDist) bestDist = d;
  }
  if (bestDist <= BACK_EDGE_TOUCH_THRESHOLD_MM) return 1;
  if (bestDist >= 1500) return 0;
  return 1 - (bestDist - BACK_EDGE_TOUCH_THRESHOLD_MM) / (1500 - BACK_EDGE_TOUCH_THRESHOLD_MM);
}

/** Probe in front of the piece for clear floor (no overlap with existing OBBs). */
function scoreFrontClearance(obb: Obb, ctx: ScoreContext, requiredMm: number): number {
  if (requiredMm <= 0) return 1;
  // Front normal points in +y of the local frame.
  const c = Math.cos(obb.angle);
  const s = Math.sin(obb.angle);
  const frontNormal: Vec2 = { x_mm: -s, y_mm: c };
  const probeDistance = requiredMm;
  const probeObb: Obb = {
    cx: obb.cx + frontNormal.x_mm * (obb.hy + probeDistance / 2),
    cy: obb.cy + frontNormal.y_mm * (obb.hy + probeDistance / 2),
    hx: obb.hx,
    hy: probeDistance / 2,
    angle: obb.angle,
  };
  for (const e of ctx.existing) {
    const eObb = makeFurnitureObb(e.x_mm, e.y_mm, e.rotation_deg, e.width_mm, e.depth_mm);
    if (obbOverlap(probeObb, eObb)) return 0;
  }
  return 1;
}

function scoreCenterBias(pose: CandidatePose, ctx: ScoreContext, allow: boolean): number {
  if (!allow) return 0;
  const dx = pose.x_mm - ctx.centroid.x_mm;
  const dy = pose.y_mm - ctx.centroid.y_mm;
  const d = Math.hypot(dx, dy);
  return clamp01(1 - d / (ctx.diagonalMm / 2));
}

function scorePairing(
  pose: CandidatePose,
  ctx: ScoreContext,
  pairs: FurnitureCategory[],
  withinMm: number,
): number {
  if (pairs.length === 0 || withinMm <= 0) return 0;
  const angleRad = (pose.rotation_deg * Math.PI) / 180;
  const frontX = -Math.sin(angleRad);
  const frontY = Math.cos(angleRad);
  let best = 0;
  for (const e of ctx.existing) {
    if (!pairs.includes(e.category)) continue;
    const dx = e.x_mm - pose.x_mm;
    const dy = e.y_mm - pose.y_mm;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const distScore = clamp01(1 - d / withinMm);
    const facing = clamp01((frontX * dx + frontY * dy) / d);
    // Partner's front normal — pairing scores higher when both items face each other.
    const eAngle = (e.rotation_deg * Math.PI) / 180;
    const eFrontX = -Math.sin(eAngle);
    const eFrontY = Math.cos(eAngle);
    const dot = frontX * eFrontX + frontY * eFrontY;
    const antiParallel = clamp01(-dot * 0.5 + 0.5);
    const v = 0.25 * distScore + 0.35 * facing + 0.4 * antiParallel;
    if (v > best) best = v;
  }
  return best;
}

function scoreAxisAlign(rotation_deg: number, walls: ScoreContext["walls"]): number {
  if (walls.length === 0) return 0;
  const r = ((rotation_deg % 180) + 180) % 180;
  let bestDelta = 90;
  for (const w of walls) {
    const wa = ((w.angleDeg % 180) + 180) % 180;
    const delta = Math.min(Math.abs(r - wa), 180 - Math.abs(r - wa));
    if (delta < bestDelta) bestDelta = delta;
  }
  return clamp01(1 - bestDelta / 30);
}

function scoreNeighborSpacing(obb: Obb, existing: ExistingItem[]): number {
  if (existing.length === 0) return 1;
  let nearest = Infinity;
  for (const e of existing) {
    const d = Math.hypot(obb.cx - e.x_mm, obb.cy - e.y_mm);
    if (d < nearest) nearest = d;
  }
  // Sweet spot ~ 800-2000mm. Penalise too close, mildly penalise too far.
  if (nearest < 600) return 0;
  if (nearest > 4000) return 0.4;
  if (nearest < 800) return 0.5 + ((nearest - 600) / 200) * 0.5;
  return 1;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function buildContext(
  poly: Vec2[],
  walls: ScoreContext["walls"],
  candidate: ScoreContext["candidate"],
  existing: ExistingItem[],
): ScoreContext {
  const centroid = polygonCentroid(poly);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x_mm < minX) minX = p.x_mm;
    if (p.y_mm < minY) minY = p.y_mm;
    if (p.x_mm > maxX) maxX = p.x_mm;
    if (p.y_mm > maxY) maxY = p.y_mm;
  }
  const diagonalMm = Math.hypot(maxX - minX, maxY - minY);
  return { poly, walls, centroid, diagonalMm, candidate, existing };
}
