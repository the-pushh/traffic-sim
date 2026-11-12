import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import type { SceneDefinition } from '../simulation/network/scene';
import { placePart } from './placement';

/** A road from the west edge to tile 4, ending in an open end at x = 5. */
const road: SceneDefinition = {
  id: 'test',
  name: 'Test',
  pieces: Array.from({ length: 5 }, (_, i) => ({ piece: 'straight', at: [i + 0.5, 8.5], rotation: 0 })),
  controls: [],
  demand: { gateways: { A: 1 } },
};

describe('placement rules (shared by preview and drop)', () => {
  it('snaps a road piece onto a nearby open road end, joining it', () => {
    const result = placePart(road, { part: 'straight', pointer: [5.8, 8.9], rotation: 0 });
    expect(result.valid).toBe(true);
    expect(result.placement).toEqual({ piece: 'straight', at: [5.5, 8.5], rotation: 0, level: 0 });
    expect(result.snappedTo).toEqual([5, 0, 8.5]);
    const graph = buildLaneGraph(result.scene!.pieces);
    expect(graph.openEnds).toEqual([{ at: [6, 8.5], level: 0, facing: [1, 0] }]);
    expect(graph.mismatches).toEqual([]);
  });

  it('places a piece on the grid where it is dropped when no road end is near', () => {
    const result = placePart(road, { part: 'crossroad', pointer: [10.2, 3.7], rotation: 0 });
    expect(result).toMatchObject({ valid: true, placement: { piece: 'crossroad', at: [10.5, 3.5], rotation: 0, level: 0 }, snappedTo: null });
  });

  it('explains why a placement is invalid and leaves the scene unchanged', () => {
    const onTop = placePart(road, { part: 'straight', pointer: [2.4, 8.6], rotation: 90 });
    expect(onTop).toMatchObject({ valid: false, reason: 'Something’s already there' });
    const offBoard = placePart(road, { part: 'roundabout', pointer: [15.4, 15.4], rotation: 0 });
    expect(offBoard).toMatchObject({ valid: false, reason: 'Off the board' });
    expect(offBoard.scene).toBeNull();
  });

  it('continues a one-way carriageway when extending it', () => {
    const divided: SceneDefinition = { ...road, pieces: road.pieces.map((p) => ({ ...p, flow: { w: 'in', e: 'out' } })) };
    const result = placePart(divided, { part: 'straight', pointer: [5.6, 8.4], rotation: 0 });
    expect(result.valid).toBe(true);
    expect(result.placement!.flow).toEqual({ w: 'in', e: 'out' });
    expect(buildLaneGraph(result.scene!.pieces).mismatches).toEqual([]);
  });

  it('says a ramp is needed where road ends meet at different heights', () => {
    const raised: SceneDefinition = { ...road, pieces: [...road.pieces, { piece: 'ramp', at: [5.5, 8.5], rotation: 0 }] };
    // The ramp ends 0.25 tile up at x = 6; a flat road there is at ground level.
    const result = placePart(raised, { part: 'straight', pointer: [6.5, 8.5], rotation: 0, level: 0, snap: false });
    expect(result).toMatchObject({ valid: false, reason: 'Ramp needed to connect these heights' });
    // Snapping lifts it to the ramp's height instead.
    expect(placePart(raised, { part: 'straight', pointer: [6.5, 8.5], rotation: 0 }).placement!.level).toBe(0.25);
  });

  it('puts a control on the approach nearest the drop, replacing any control already there', () => {
    const junction: SceneDefinition = { ...road, pieces: [...road.pieces, { piece: 't-junction', at: [5.5, 8.5], rotation: 0 }] };
    const stop = placePart(junction, { part: 'stop', pointer: [5.1, 8.6], rotation: 0 });
    expect(stop).toMatchObject({ valid: true, control: { type: 'stop', piece: 5, port: 'w' } });
    const yieldThere = placePart(stop.scene!, { part: 'yield', pointer: [5.1, 8.6], rotation: 0 });
    expect(yieldThere.scene!.controls).toEqual([{ type: 'yield', piece: 5, port: 'w' }]);
    expect(placePart(junction, { part: 'signal', pointer: [12, 2], rotation: 0 })).toMatchObject({ valid: false, reason: 'Drop it where a road enters a junction' });
  });
});
