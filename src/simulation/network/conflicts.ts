import { pointAlongLane } from './laneGeometry';
import type { Lane, LaneGraph, Point3 } from './buildLaneGraph';

export type Turn = 'straight' | 'left' | 'right' | 'u-turn';

/** Where another lane meets this one inside the same junction piece. */
export interface Conflict {
  lane: number;
  /** `cross`: the paths cut across each other; `merge`: they end in the same place. */
  kind: 'cross' | 'merge';
  /** Distance along this lane to the meeting point, tiles. */
  at: number;
  /** Distance along the other lane to the meeting point, tiles. */
  otherAt: number;
}

function headingAt(points: Point3[], fromEnd: boolean): [number, number] {
  const [a, b] = fromEnd ? [points[points.length - 2], points[points.length - 1]] : [points[0], points[1]];
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  return [(b[0] - a[0]) / length, (b[2] - a[2]) / length];
}

/** Which way a movement turns, seen from above with x east and z south (right-hand traffic). */
export function turnOf(lane: Lane): Turn {
  return turnBetween(lane, lane);
}

/** Which way a movement turns from the start of `first` to the end of `last` (e.g. across a two-tile junction). */
export function turnBetween(first: Lane, last: Lane): Turn {
  const [h0, h1] = [headingAt(first.points, false), headingAt(last.points, true)];
  const dot = h0[0] * h1[0] + h0[1] * h1[1];
  const cross = h0[0] * h1[1] - h0[1] * h1[0];
  if (dot > 0.7) return 'straight';
  if (dot < -0.7) return 'u-turn';
  return cross > 0 ? 'right' : 'left';
}

/**
 * Paths closer than this are a conflict even if they never strictly cross, in tiles
 * (1.3 m). Measured on the kit's junctions: genuinely touching paths (opposing left
 * turns) come within 0.06 tile; side-by-side entry and exit lanes at a roundabout arm
 * stay 0.27 tile apart and aren't conflicts.
 */
const CLEARANCE = 0.15;

const near = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;

/** First point where two polylines cross (on the ground plane), as distances along each. */
function crossing(a: Point3[], b: Point3[]): { at: number; otherAt: number } | null {
  let alongA = 0;
  for (let i = 1; i < a.length; i++) {
    const [p, p2] = [a[i - 1], a[i]];
    const r = [p2[0] - p[0], p2[2] - p[2]];
    const lenA = Math.hypot(r[0], r[1]);
    let alongB = 0;
    for (let j = 1; j < b.length; j++) {
      const [q, q2] = [b[j - 1], b[j]];
      const s = [q2[0] - q[0], q2[2] - q[2]];
      const lenB = Math.hypot(s[0], s[1]);
      const denom = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(denom) > 1e-12) {
        const qp = [q[0] - p[0], q[2] - p[2]];
        const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
        const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
        if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 && Math.abs(p[1] - q[1]) < 0.1) {
          return { at: alongA + t * lenA, otherAt: alongB + u * lenB };
        }
      }
      alongB += lenB;
    }
    alongA += lenA;
  }
  return null;
}

/** Closest approach between two polylines (sampled at their vertices), as distances along each. */
function closestApproach(a: Point3[], b: Point3[]): { distance: number; at: number; otherAt: number } {
  const along = (points: Point3[]) => {
    const d = [0];
    for (let i = 1; i < points.length; i++) d.push(d[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
    return d;
  };
  const [da, db] = [along(a), along(b)];
  let best = { distance: Infinity, at: 0, otherAt: 0 };
  a.forEach((p, i) =>
    b.forEach((q, j) => {
      const d = Math.hypot(p[0] - q[0], p[2] - q[2]);
      if (d < best.distance && Math.abs(p[1] - q[1]) < 0.1) best = { distance: d, at: da[i], otherAt: db[j] };
    }),
  );
  return best;
}

/**
 * For every lane, the other lanes in the same piece that cross it, merge with it, or
 * pass within a vehicle's width of it (treated as crossing at the closest point).
 * Lanes from the same approach diverge and don't conflict.
 */
export function findConflicts(graph: LaneGraph): Map<number, Conflict[]> {
  const result = new Map<number, Conflict[]>(graph.lanes.map((l) => [l.id, []]));
  const byPiece = new Map<number, Lane[]>();
  for (const lane of graph.lanes) {
    const list = byPiece.get(lane.piece);
    if (list) list.push(lane);
    else byPiece.set(lane.piece, [lane]);
  }
  for (const lanes of byPiece.values()) {
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        const [a, b] = [lanes[i], lanes[j]];
        if (near(a.points[0], b.points[0])) continue; // same approach: they diverge
        if (near(a.points[a.points.length - 1], b.points[b.points.length - 1])) {
          result.get(a.id)!.push({ lane: b.id, kind: 'merge', at: a.length, otherAt: b.length });
          result.get(b.id)!.push({ lane: a.id, kind: 'merge', at: b.length, otherAt: a.length });
          continue;
        }
        let hit = crossing(a.points, b.points);
        if (!hit) {
          const passing = closestApproach(a.points, b.points);
          // Ignore near-touches at the very ends, where lanes from neighbouring approaches start or finish side by side.
          const interior = passing.at > 0.05 && passing.at < a.length - 0.05 && passing.otherAt > 0.05 && passing.otherAt < b.length - 0.05;
          if (passing.distance < CLEARANCE && interior) hit = { at: passing.at, otherAt: passing.otherAt };
        }
        if (!hit) {
          // One lane ending right where another starts (a narrow driveway's way in and way out): they share that spot.
          const [aEnd, bEnd] = [a.points[a.points.length - 1], b.points[b.points.length - 1]];
          const close = (p: Point3, q: Point3) => !near(p, q) && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < CLEARANCE;
          if (close(aEnd, b.points[0])) hit = { at: a.length, otherAt: 0 };
          else if (close(a.points[0], bEnd)) hit = { at: 0, otherAt: b.length };
        }
        if (hit) {
          result.get(a.id)!.push({ lane: b.id, kind: 'cross', at: hit.at, otherAt: hit.otherAt });
          result.get(b.id)!.push({ lane: a.id, kind: 'cross', at: hit.otherAt, otherAt: hit.at });
        }
      }
    }
  }
  return result;
}

/**
 * Where two lanes leave the same point (a split, or a lay-by peeling off): how far along
 * `lane` it gets before it is at least `separation` away from `other`, in tiles. A
 * vehicle on `lane` blocks the split until its rear is past this.
 */
export function splitClearance(lane: Lane, other: Lane, separation: number): number {
  const step = 0.05;
  for (let along = 0; along <= lane.length; along += step) {
    const { point } = pointAlongLane(lane, along);
    if (distanceToPolyline(point, other.points) >= separation) return along;
  }
  return lane.length;
}

function distanceToPolyline(p: Point3, line: Point3[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[2] - (a[2] + t * dz)));
  }
  return best;
}
