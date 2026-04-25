/**
 * Geometry primitives for the furniture auto-placement algorithm.
 * All coordinates are millimetres. Angles are degrees, CCW, 0 = +x.
 */

export interface Vec2 {
  x_mm: number;
  y_mm: number;
}

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Obb {
  /** centre point */
  cx: number;
  cy: number;
  /** half-extents */
  hx: number;
  hy: number;
  /** rotation, radians, CCW */
  angle: number;
}

const DEG = Math.PI / 180;

export function deg2rad(deg: number): number {
  return deg * DEG;
}

/** Returns the four corners of an oriented bounding box, CCW. */
export function obbCorners(obb: Obb): Vec2[] {
  const c = Math.cos(obb.angle);
  const s = Math.sin(obb.angle);
  const { hx, hy, cx, cy } = obb;
  const local: Array<[number, number]> = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ];
  return local.map(([x, y]) => ({
    x_mm: cx + x * c - y * s,
    y_mm: cy + x * s + y * c,
  }));
}

/** Build an OBB from a furniture pose (footprint origin = centre). */
export function makeFurnitureObb(
  x_mm: number,
  y_mm: number,
  rotation_deg: number,
  width_mm: number,
  depth_mm: number,
): Obb {
  return {
    cx: x_mm,
    cy: y_mm,
    hx: width_mm / 2,
    hy: depth_mm / 2,
    angle: deg2rad(rotation_deg),
  };
}

export function polygonAabb(poly: Vec2[]): Aabb {
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
  return { minX, minY, maxX, maxY };
}

/** Signed area; positive when polygon is CCW. */
export function signedPolygonArea(poly: Vec2[]): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    s += a.x_mm * b.y_mm - b.x_mm * a.y_mm;
  }
  return s / 2;
}

/** Ensure CCW winding (returns a new array if reversed). */
export function ensureCcw(poly: Vec2[]): Vec2[] {
  return signedPolygonArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % n]!;
    const cross = p0.x_mm * p1.y_mm - p1.x_mm * p0.y_mm;
    a += cross;
    cx += (p0.x_mm + p1.x_mm) * cross;
    cy += (p0.y_mm + p1.y_mm) * cross;
  }
  if (a === 0) {
    // Fall back to vertex average for degenerate polygons.
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x_mm;
      sy += p.y_mm;
    }
    return { x_mm: sx / n, y_mm: sy / n };
  }
  a *= 0.5;
  return { x_mm: cx / (6 * a), y_mm: cy / (6 * a) };
}

/** Standard ray-casting point-in-polygon test. Boundary points count as inside. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const xi = pi.x_mm;
    const yi = pi.y_mm;
    const xj = pj.x_mm;
    const yj = pj.y_mm;
    const intersect =
      yi > p.y_mm !== yj > p.y_mm &&
      p.x_mm < ((xj - xi) * (p.y_mm - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ax = a.x_mm;
  const ay = a.y_mm;
  const bx = b.x_mm;
  const by = b.y_mm;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ddx = p.x_mm - ax;
    const ddy = p.y_mm - ay;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((p.x_mm - ax) * dx + (p.y_mm - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  const ex = p.x_mm - px;
  const ey = p.y_mm - py;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Min distance from a point to any edge of the polygon. */
export function distancePointToPolygonEdge(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const d = distancePointToSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/**
 * True if every corner of the OBB lies inside the polygon AND no polygon edge
 * crosses any OBB edge. Sufficient for convex+concave rooms in practice.
 */
export function obbInsidePolygon(obb: Obb, poly: Vec2[]): boolean {
  const corners = obbCorners(obb);
  for (const c of corners) {
    if (!pointInPolygon(c, poly)) return false;
  }
  // Edge-vs-edge check rejects cases where the OBB straddles a notch
  // (e.g. an L-shape) without any corner being outside.
  const n = poly.length;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    for (let j = 0; j < n; j++) {
      const c = poly[j]!;
      const d = poly[(j + 1) % n]!;
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return false; // ignore collinear/touching for placement-fit purposes
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x_mm - a.x_mm) * (c.y_mm - a.y_mm) - (b.y_mm - a.y_mm) * (c.x_mm - a.x_mm);
}

/** SAT overlap test for two OBBs. Returns true if they overlap. */
export function obbOverlap(a: Obb, b: Obb): boolean {
  const ca = obbCorners(a);
  const cb = obbCorners(b);
  const axes = [
    sub(ca[1]!, ca[0]!),
    sub(ca[3]!, ca[0]!),
    sub(cb[1]!, cb[0]!),
    sub(cb[3]!, cb[0]!),
  ].map(normalize);
  for (const axis of axes) {
    const [aMin, aMax] = projectCorners(ca, axis);
    const [bMin, bMax] = projectCorners(cb, axis);
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}

function projectCorners(corners: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const d = c.x_mm * axis.x_mm + c.y_mm * axis.y_mm;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x_mm: a.x_mm - b.x_mm, y_mm: a.y_mm - b.y_mm };
}

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x_mm, v.y_mm) || 1;
  return { x_mm: v.x_mm / l, y_mm: v.y_mm / l };
}

/** Wall segments (CCW), returned as start→end pairs. */
export interface WallSegment {
  a: Vec2;
  b: Vec2;
  /** outward normal (room interior is on the left of a→b for CCW polygons) */
  inwardNormal: Vec2;
  /** axis-aligned wall direction in degrees, [0, 360) */
  angleDeg: number;
  lengthMm: number;
}

export function polygonWalls(poly: Vec2[]): WallSegment[] {
  const n = poly.length;
  const walls: WallSegment[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dx = b.x_mm - a.x_mm;
    const dy = b.y_mm - a.y_mm;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // For a CCW polygon, the interior is on the LEFT of a→b.
    // Left-perpendicular of (dx, dy) is (-dy, dx). Normalize.
    const inwardNormal: Vec2 = { x_mm: -dy / len, y_mm: dx / len };
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    walls.push({ a, b, inwardNormal, angleDeg, lengthMm: len });
  }
  return walls;
}
