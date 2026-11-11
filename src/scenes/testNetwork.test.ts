import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { validateScene } from '../simulation/network/scene';
import { testNetwork } from './testNetwork';

describe('test network scene', () => {
  const graph = buildLaneGraph(testNetwork.pieces);

  it('is a valid scene', () => {
    expect(validateScene(testNetwork)).toEqual([]);
  });

  it('has entry/exit points on every side of the board, a driveway, and an open end for players', () => {
    expect(graph.gateways.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(graph.accessPoints).toHaveLength(1);
    expect(graph.openEnds).toEqual([{ at: [1.5, 8], level: 0, facing: [0, -1] }]);
  });

  it('connects every road end that should connect: only gateways, the driveway and the open end are loose', () => {
    const loose = graph.lanes.filter((l) => l.next.length === 0 || l.previous.length === 0);
    const expected = new Set([
      ...graph.gateways.flatMap((g) => [...g.entryLanes, ...g.exitLanes]),
      ...graph.accessPoints.flatMap((a) => [...a.entryLanes, ...a.exitLanes]),
    ]);
    const atOpenEnd = (id: number) => {
      const lane = graph.lanes[id];
      return [lane.points[0], lane.points.at(-1)!].some((p) => Math.abs(p[0] - 1.5) < 0.3 && Math.abs(p[2] - 8) < 1e-6);
    };
    for (const lane of loose) expect(expected.has(lane.id) || atOpenEnd(lane.id), `lane ${lane.id}`).toBe(true);
  });
});
