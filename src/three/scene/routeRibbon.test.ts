import { describe, expect, it } from 'vitest';
import { routeRibbon } from './routeRibbon';

/** Vertex `i` of the ribbon as [x, y, z]. */
const vertex = (positions: Float32Array, i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

describe('route ribbon (the inspected vehicle’s route painted on the road)', () => {
  it('lies flat at the road’s height, the given width across the direction of travel', () => {
    const { positions, indices } = routeRibbon([[0, 0.1, 0], [10, 0.1, 0]], 0.5);
    expect(positions.length / 3).toBe(4);
    for (let i = 0; i < 4; i++) expect(vertex(positions, i)[1]).toBeCloseTo(0.1);
    // Across an east-going road: the edges are 0.25 north and south of the centre line.
    expect(vertex(positions, 0)).toEqual([0, expect.closeTo(0.1), -0.25].map((v) => (typeof v === 'number' ? expect.closeTo(v) : v)));
    expect(vertex(positions, 1)[2]).toBeCloseTo(0.25);
    expect(indices.length).toBe(6); // one quad
  });

  it('follows a ramp’s height and keeps its width round a corner', () => {
    const { positions } = routeRibbon([[0, 0, 0], [4, 1, 0], [4, 1, 4]], 0.5);
    expect(vertex(positions, 2)[1]).toBeCloseTo(1); // at the top of the climb
    // At the corner the two edges are still about the width apart (mitred, not pinched).
    const [a, b] = [vertex(positions, 2), vertex(positions, 3)];
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeLessThan(0.75);
  });

  it('skips repeated points instead of making a broken edge', () => {
    const { positions } = routeRibbon([[0, 0, 0], [0, 0, 0], [5, 0, 0]], 0.5);
    expect(positions.length / 3).toBe(4);
    expect([...positions].every(Number.isFinite)).toBe(true);
  });
});
