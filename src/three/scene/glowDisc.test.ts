import { describe, expect, it } from 'vitest';
import { glowDisc } from './glowDisc';

describe('glow disc (the soft glow under the inspected vehicle)', () => {
  const { positions, alphas, indices } = glowDisc(1.6, 0.8);
  const count = positions.length / 3;
  const distance = (i: number) => Math.hypot(positions[i * 3], positions[i * 3 + 2]);

  it('lies flat on the ground, within its radius, as a closed mesh of triangles', () => {
    for (let i = 0; i < count; i++) {
      expect(positions[i * 3 + 1]).toBe(0);
      expect(distance(i)).toBeLessThanOrEqual(1.6 + 1e-6);
    }
    expect(indices.length % 3).toBe(0);
    expect(Math.max(...indices)).toBe(count - 1);
  });

  it('is brightest at the centre and fades smoothly to nothing at the rim', () => {
    expect(alphas[0]).toBeCloseTo(0.8); // the centre
    const rim = [...Array(count).keys()].filter((i) => Math.abs(distance(i) - 1.6) < 1e-6);
    expect(rim.length).toBeGreaterThan(16);
    for (const i of rim) expect(alphas[i]).toBe(0);
    // Further out is never brighter.
    const byDistance = [...Array(count).keys()].sort((a, b) => distance(a) - distance(b));
    for (let k = 1; k < byDistance.length; k++) expect(alphas[byDistance[k]]).toBeLessThanOrEqual(alphas[byDistance[k - 1]] + 1e-9);
  });
});
