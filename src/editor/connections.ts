import { portPose } from '../simulation/network/buildLaneGraph';
import { PIECES } from '../simulation/network/pieces';
import type { SceneDefinition } from '../simulation/network/scene';

/** A point on the board, [x, level, z] in tiles. */
export type BoardPoint = [number, number, number];

/** One road end of a placed piece, and whether another piece's road end meets it. */
export interface RoadEnd {
  at: BoardPoint;
  connected: boolean;
}

/** What an edit does to one piece's connections: those that stay attached, break, or are newly made. */
export interface ConnectionChange {
  kept: BoardPoint[];
  broken: BoardPoint[];
  made: BoardPoint[];
}

const EPSILON = 1e-6;
const same = (a: BoardPoint, b: BoardPoint) => a.every((v, i) => Math.abs(v - b[i]) < EPSILON);
/** Tidy floating-point noise from turning ports (e.g. 4.999999 → 5). */
const tidy = (p: BoardPoint): BoardPoint => p.map((v) => Math.round(v * 1e6) / 1e6 + 0) as BoardPoint;

function roadPorts(scene: SceneDefinition, index: number): BoardPoint[] {
  const placement = scene.pieces[index];
  return PIECES[placement.piece].ports.filter((p) => p.profile === 'road').map((p) => tidy(portPose(placement, p.id).centre));
}

/** The road ends of piece `index`, each marked connected when another piece has a road end at the same spot. */
export function roadEndsOf(scene: SceneDefinition, index: number): RoadEnd[] {
  const others = scene.pieces.flatMap((_, i) => (i === index ? [] : roadPorts(scene, i)));
  return roadPorts(scene, index).map((at) => ({ at, connected: others.some((o) => same(o, at)) }));
}

/**
 * Compare a piece's connections before an edit (at `beforeIndex`) with the piece that takes
 * its place after (at `afterIndex`): which stay attached, which break and which are new.
 */
export function connectionChange(before: SceneDefinition, beforeIndex: number, after: SceneDefinition, afterIndex: number): ConnectionChange {
  const was = roadEndsOf(before, beforeIndex).filter((e) => e.connected).map((e) => e.at);
  const now = roadEndsOf(after, afterIndex).filter((e) => e.connected).map((e) => e.at);
  return {
    kept: was.filter((p) => now.some((q) => same(p, q))),
    broken: was.filter((p) => !now.some((q) => same(p, q))),
    made: now.filter((p) => !was.some((q) => same(p, q))),
  };
}
