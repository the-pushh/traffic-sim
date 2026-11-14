import { describe, expect, it } from 'vitest';
import { turnedRotation } from './rotateHandle';

// Board points are [x, z] with x east and z south; the piece stands at the origin.
describe('dragging the rotation handle', () => {
  it('keeps the turn until the drag passes half a quarter', () => {
    expect(turnedRotation(0, [0, 0], [1, 0], [1, -0.5])).toBe(0); // ~27°: not yet
  });

  it('turns in quarter steps: anticlockwise seen from above is positive, as placement turns', () => {
    expect(turnedRotation(0, [0, 0], [1, 0], [0, -1])).toBe(90); // east to north
    expect(turnedRotation(0, [0, 0], [1, 0], [0, 1])).toBe(270); // east to south: a quarter back
    expect(turnedRotation(90, [0, 0], [1, 0], [-1, 0.01])).toBe(270); // a half turn from 90
  });

  it('measures about the piece, wherever it stands', () => {
    expect(turnedRotation(270, [8.5, 8.5], [9.5, 8.5], [8.5, 7.5])).toBe(0);
  });
});
