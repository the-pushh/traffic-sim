import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { validateScene } from '../simulation/network/scene';
import { signalTest } from './signalTest';

describe('signal test scene', () => {
  it('is a valid scene with an entry at each end of the road', () => {
    expect(validateScene(signalTest)).toEqual([]);
    const graph = buildLaneGraph(signalTest.pieces);
    expect(graph.gateways.map((g) => [g.label, g.at])).toEqual([
      ['A', [16, 8.5]],
      ['B', [0, 8.5]],
    ]);
  });
});
