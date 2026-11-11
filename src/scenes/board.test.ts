import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, boardToWorld, groundBoard, TILE_SIZE } from './board';
import { testNetwork } from './testNetwork';

/** Whether a world point lies on the board's rounded-square top face. */
function onBoard(x: number, z: number) {
  const { size, cornerRadius: radius } = groundBoard;
  const half = size / 2;
  const dx = Math.abs(x);
  const dz = Math.abs(z);
  if (dx > half + 1e-9 || dz > half + 1e-9) return false;
  return Math.hypot(Math.max(dx - (half - radius), 0), Math.max(dz - (half - radius), 0)) <= radius + 1e-9;
}

describe('ground board', () => {
  it('is a 16 × 16 road-tile square centred on the origin, big enough for multi-junction scenes', () => {
    expect(groundBoard.size).toBe(16 * TILE_SIZE);
    expect(boardToWorld([0, 0, 0])).toEqual([-groundBoard.size / 2, 0, -groundBoard.size / 2]);
    expect(boardToWorld([BOARD_TILES / 2, 0.5, BOARD_TILES / 2])).toEqual([0, 0.5 * TILE_SIZE, 0]);
  });

  it('holds every lane of the test network on its top face, clear of the rounded corners', () => {
    const graph = buildLaneGraph(testNetwork.pieces);
    for (const lane of graph.lanes)
      for (const point of lane.points) {
        const [x, , z] = boardToWorld(point);
        expect(onBoard(x, z), point.join(',')).toBe(true);
      }
  });

  it('has a 0.8-unit edge: half the earlier 1.6', () => {
    expect(groundBoard.thickness + 2 * groundBoard.bevel).toBeCloseTo(0.8, 9);
    expect(groundBoard.cornerRadius).toBeGreaterThan(0);
  });
});
