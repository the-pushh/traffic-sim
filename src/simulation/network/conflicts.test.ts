import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from './buildLaneGraph';
import { findConflicts, turnOf } from './conflicts';

const crossroad = buildLaneGraph([{ piece: 'crossroad', at: [8.5, 8.5], rotation: 0 }]);
const heading = (id: number) => {
  const p = crossroad.lanes[id].points;
  const [a, b] = [p[0], p[1]];
  return [Math.round(b[0] - a[0] > 0 ? 1 : b[0] - a[0] < 0 ? -1 : 0), Math.round(b[2] - a[2] > 0 ? 1 : b[2] - a[2] < 0 ? -1 : 0)];
};
/** Lane entering from `side` and turning `turn`. */
const laneFrom = (side: 'w' | 'e' | 'n' | 's', turn: 'straight' | 'left' | 'right') =>
  crossroad.lanes.find((l) => {
    const [x, , z] = l.points[0];
    const at = { w: x === 8, e: x === 9, n: z === 8, s: z === 9 }[side];
    return at && turnOf(l) === turn;
  })!;

describe('junction conflicts', () => {
  const conflicts = findConflicts(crossroad);

  it('classifies each movement through a crossroads as straight, left or right (right-hand traffic)', () => {
    const fromWest = crossroad.lanes.filter((l) => l.points[0][0] === 8);
    expect(fromWest.map(turnOf).sort()).toEqual(['left', 'right', 'straight']);
    expect(heading(laneFrom('w', 'straight').id)).toEqual([1, 0]);
  });

  it('finds where crossing movements cut across each other', () => {
    const westStraight = laneFrom('w', 'straight').id;
    const southStraight = laneFrom('s', 'straight').id;
    const crossing = conflicts.get(westStraight)!.find((c) => c.lane === southStraight);
    expect(crossing).toBeDefined();
    expect(crossing!.kind).toBe('cross');
    // Distances along each lane to the crossing point, in tiles.
    expect(crossing!.at).toBeGreaterThan(0);
    expect(crossing!.otherAt).toBeGreaterThan(0);
  });

  it('marks movements that end in the same lane as merging, and leaves non-conflicting ones alone', () => {
    // Turning right from the south and going straight from the west both end heading east.
    const westStraight = laneFrom('w', 'straight').id;
    const southRight = laneFrom('s', 'right').id;
    expect(conflicts.get(westStraight)!.find((c) => c.lane === southRight)?.kind).toBe('merge');
    // Right turns from opposite sides never meet.
    const northRight = laneFrom('n', 'right').id;
    expect(conflicts.get(southRight)!.some((c) => c.lane === northRight)).toBe(false);
    // Movements from the same approach diverge; they don't conflict.
    expect(conflicts.get(westStraight)!.some((c) => c.lane === laneFrom('w', 'left').id)).toBe(false);
  });
});
