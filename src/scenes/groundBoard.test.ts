import { describe, expect, it } from 'vitest';
import { groundBoard, starterFootprint, starterScene } from './starterScene';

/** Whether a ground point lies on a rounded square's top face. */
function onBoard(size: number, radius: number, x: number, z: number) {
  const half = size / 2;
  const dx = Math.abs(x);
  const dz = Math.abs(z);
  if (dx > half || dz > half) return false;
  const cx = Math.max(dx - (half - radius), 0);
  const cz = Math.max(dz - (half - radius), 0);
  return Math.hypot(cx, cz) <= radius;
}

describe('ground board', () => {
  it('is a 16 × 16 road-tile square centred on the origin, big enough for multi-junction scenes', () => {
    expect(groundBoard.size).toBe(16 * starterScene.road.tileSize);
  });

  it('holds the starter roads with clear ground around them, away from the rounded corners', () => {
    const f = starterFootprint();
    const clearance = 4;
    for (const x of [f.minX - clearance, f.maxX + clearance])
      for (const z of [f.minZ - clearance, f.maxZ + clearance])
        expect(onBoard(groundBoard.size, groundBoard.cornerRadius, x, z), `${x},${z}`).toBe(true);
  });

  it('has a 0.8-unit edge: half the earlier 1.6', () => {
    expect(groundBoard.thickness + 2 * groundBoard.bevel).toBeCloseTo(0.8, 9);
    expect(groundBoard.cornerRadius).toBeGreaterThan(0);
  });
});
