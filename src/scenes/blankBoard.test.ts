import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { validateScene } from '../simulation/network/scene';
import { blankBoard } from './blankBoard';
import { runScene, simulateScene } from './sceneTesting';

describe('Blank board', () => {
  const graph = buildLaneGraph(blankBoard.pieces);

  it('has only entry/exit points at the edges, each with an open end to build from', () => {
    expect(validateScene(blankBoard)).toEqual([]);
    expect(graph.gateways.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(graph.openEnds).toHaveLength(4);
    expect(graph.mismatches).toEqual([]);
    expect(blankBoard.controls).toEqual([]);
  });

  it('opens quietly: no trips until the edges are joined up', () => {
    const s = simulateScene(blankBoard, 'medium', 1);
    runScene(s, 30);
    expect(s.counts).toMatchObject({ due: 0, entered: 0, blocked: 0 });
  });
});
