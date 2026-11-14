import type { SceneDefinition } from '../simulation/network/scene';
import { connectionChange } from './connections';
import { replacePiece } from './edits';
import { PARTS, type PartId } from './parts';

/** A part that could take a piece's place, and what swapping it in would do. */
export interface Replacement {
  part: PartId;
  /** It can go there (same spot and turn) without overlapping or mismatching a neighbour. */
  fits: boolean;
  /** Why not, when it doesn't fit. */
  reason?: string;
  /** Connections the swap keeps and breaks. */
  kept: number;
  broken: number;
}

/**
 * Every road part that could replace piece `index`, best first: parts that fit and keep the
 * most connections (breaking the fewest), then those that fit but break some, then those that
 * can't go there. Ties keep the drawer's order.
 */
export function replacementsFor(scene: SceneDefinition, index: number): Replacement[] {
  const current = scene.pieces[index].piece;
  const options = PARTS.filter((p) => p.kind === 'piece' && p.id !== current).map((p): Replacement => {
    const result = replacePiece(scene, index, p.id);
    if (!result.valid || !result.scene) return { part: p.id, fits: false, reason: result.reason, kept: 0, broken: 0 };
    const change = connectionChange(scene, index, result.scene, result.scene.pieces.length - 1);
    return { part: p.id, fits: true, kept: change.kept.length, broken: change.broken.length };
  });
  const rank = (o: Replacement) => (o.fits ? 0 : 1);
  return options
    .map((o, order) => ({ o, order }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.o.broken - b.o.broken || b.o.kept - a.o.kept || a.order - b.order)
    .map(({ o }) => o);
}
