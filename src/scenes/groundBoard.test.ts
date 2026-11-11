import { describe, expect, it } from 'vitest';
import { squareBoard } from './groundBoard';
import { starterFootprint, starterScene } from './starterScene';

/** Whether a ground point lies on a rounded square's top face. */
function onBoard(board: ReturnType<typeof squareBoard>, radius: number, x: number, z: number) {
  const half = board.size / 2;
  const dx = Math.abs(x - board.centerX);
  const dz = Math.abs(z - board.centerZ);
  if (dx > half || dz > half) return false;
  const cx = Math.max(dx - (half - radius), 0);
  const cz = Math.max(dz - (half - radius), 0);
  return Math.hypot(cx, cz) <= radius;
}

describe('ground board', () => {
  it('is a square centred on the road network with a margin on its longer side', () => {
    const board = squareBoard({ minX: -2, maxX: 8, minZ: -12, maxZ: 12 }, 4);
    expect(board).toEqual({ centerX: 3, centerZ: 0, size: 32 });
  });

  it('covers the starter roads and vehicle, keeping the margin clear of its rounded corners', () => {
    const footprint = starterFootprint();
    expect(footprint).toEqual({ minX: -2, maxX: 8, minZ: -12, maxZ: 12 });

    const { margin, cornerRadius } = starterScene.ground;
    const board = squareBoard(footprint, margin);
    for (const x of [footprint.minX - margin, footprint.maxX + margin]) {
      for (const z of [footprint.minZ, footprint.maxZ]) expect(onBoard(board, cornerRadius, x, z), `${x},${z}`).toBe(true);
    }
    for (const x of [footprint.minX, footprint.maxX]) {
      for (const z of [footprint.minZ - margin, footprint.maxZ + margin]) expect(onBoard(board, cornerRadius, x, z), `${x},${z}`).toBe(true);
    }
  });

  it('has visible thickness and rounded corners', () => {
    expect(starterScene.ground.thickness).toBeGreaterThan(0);
    expect(starterScene.ground.cornerRadius).toBeGreaterThan(0);
  });
});
