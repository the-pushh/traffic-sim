import { describe, expect, it } from 'vitest';
import { routeChevrons } from './routeChevrons';

/** Vertex `i` as [x, y, z]. */
const vertex = (positions: Float32Array, i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
const SHAPE = { spacing: 1, length: 0.5, width: 0.8, thickness: 0.2 };
const VERTICES_PER_CHEVRON = 6;

describe('route chevrons (the inspected vehicle’s route painted on the road as arrows)', () => {
  it('spaces chevrons evenly along the route, the first half a gap from its start', () => {
    const { positions } = routeChevrons([[0, 0.1, 0], [10, 0.1, 0]], SHAPE);
    const count = positions.length / 3 / VERTICES_PER_CHEVRON;
    expect(count).toBe(10); // at 0.5, 1.5 … 9.5
    // Each chevron's tip (its first vertex) is half its length ahead of its centre.
    expect(vertex(positions, 0)[0]).toBeCloseTo(0.75);
    expect(vertex(positions, VERTICES_PER_CHEVRON)[0]).toBeCloseTo(1.75);
  });

  it('points each chevron the way the route goes, with its arms trailing either side', () => {
    // Going south (+z): the tip is ahead in z, the arm ends behind it and a width apart across x.
    const { positions } = routeChevrons([[0, 0, 0], [0, 0, 1]], SHAPE);
    const [tip, armA, , , , armB] = [0, 1, 2, 3, 4, 5].map((i) => vertex(positions, i));
    expect(tip[2]).toBeCloseTo(0.75);
    expect(armA[2]).toBeCloseTo(0.25);
    expect(armB[2]).toBeCloseTo(0.25);
    expect(Math.abs(armA[0] - armB[0])).toBeCloseTo(0.8);
    expect(tip[0]).toBeCloseTo(0);
  });

  it('draws thick arms: two filled quads per chevron, the given thickness along the route', () => {
    const { positions, indices } = routeChevrons([[0, 0, 0], [1, 0, 0]], SHAPE);
    expect(indices.length).toBe(12);
    const [tip, , , innerTip] = [0, 1, 2, 3].map((i) => vertex(positions, i));
    expect(tip[0] - innerTip[0]).toBeCloseTo(0.2);
  });

  it('lies on the road: follows a ramp’s height, and turns with the route round a corner', () => {
    const { positions } = routeChevrons([[0, 0, 0], [4, 1, 0], [4, 1, 4]], SHAPE);
    const tips = [];
    for (let c = 0; c < positions.length / 3 / VERTICES_PER_CHEVRON; c++) tips.push(vertex(positions, c * VERTICES_PER_CHEVRON));
    // Partway up the climb, a tip is as high as the ramp is there.
    const climbing = tips.find((p) => Math.abs(p[0] - 1.75) < 0.1)!;
    expect(climbing[1]).toBeCloseTo(climbing[0] / 4, 1);
    // After the corner the tips point south: same x, increasing z, at the top's height.
    const after = tips.filter((p) => p[2] > 1);
    expect(after.length).toBeGreaterThan(2);
    for (const p of after) {
      expect(p[0]).toBeCloseTo(4);
      expect(p[1]).toBeCloseTo(1);
    }
  });

  it('draws nothing for a route too short to hold a chevron, and skips repeated points', () => {
    expect(routeChevrons([[0, 0, 0], [0.2, 0, 0]], SHAPE).positions.length).toBe(0);
    const { positions } = routeChevrons([[0, 0, 0], [0, 0, 0], [3, 0, 0]], SHAPE);
    expect(positions.length / 3 / VERTICES_PER_CHEVRON).toBe(3);
    expect([...positions].every(Number.isFinite)).toBe(true);
  });
});
