import { describe, expect, it } from 'vitest';
import type { Lane } from './buildLaneGraph';
import { pointAlongLane } from './laneGeometry';

const lane = (points: [number, number, number][]): Lane => ({ id: 0, piece: 0, points, length: 0, next: [], previous: [] });

describe('point along a lane', () => {
  const bent = lane([
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
  ]);

  it('walks along the centreline and gives the heading there', () => {
    expect(pointAlongLane(bent, 0.5)).toEqual({ point: [0.5, 0, 0], heading: [1, 0] });
    const around = pointAlongLane(bent, 1.25);
    expect(around.point[0]).toBeCloseTo(1, 9);
    expect(around.point[2]).toBeCloseTo(0.25, 9);
    expect(around.heading).toEqual([0, 1]);
  });

  it('clamps to the ends', () => {
    expect(pointAlongLane(bent, -1).point).toEqual([0, 0, 0]);
    expect(pointAlongLane(bent, 5).point).toEqual([1, 0, 1]);
  });

  it('interpolates height on ramps', () => {
    expect(pointAlongLane(lane([[0, 0, 0], [1, 0.25, 0]]), Math.hypot(0.5, 0.125)).point[1]).toBeCloseTo(0.125, 9);
  });
});
