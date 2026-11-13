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

  it('joins a road dropped against the side of a straight: the straight becomes a T-junction', () => {
    // A north–south straight whose south end touches the side of the road's third tile.
    const result = placePart(road, { part: 'straight', pointer: [2.6, 7.4], rotation: 90 });
    expect(result.valid).toBe(true);
    expect(result.placement).toMatchObject({ piece: 'straight', at: [2.5, 7.5], rotation: 90 });
    expect(result.joins).toEqual([{ index: 2, from: 'straight', to: 't-junction' }]);
    expect(result.scene!.pieces[2]).toMatchObject({ piece: 't-junction', at: [2.5, 8.5] });
    const graph = buildLaneGraph(result.scene!.pieces);
    expect(graph.mismatches).toEqual([]);
    // Only the new road's far end (north) and the road's own east end are open.
    expect(graph.openEnds.map((e) => e.at)).toEqual(expect.arrayContaining([[2.5, 7], [5, 8.5]]));
    expect(graph.openEnds).toHaveLength(2);
  });

  it('turns a T-junction into a crossroads, keeping its signs on their approaches', () => {
    const tee = placePart(road, { part: 'straight', pointer: [2.6, 7.4], rotation: 90 }).scene!;
    // A stop sign on the T's west approach, then a road against its open south side.
    const signed = placePart(tee, { part: 'stop', pointer: [2.1, 8.5], rotation: 0 }).scene!;
    expect(signed.controls).toHaveLength(1);
    const result = placePart(signed, { part: 'straight', pointer: [2.4, 9.6], rotation: 90 });
    expect(result.joins).toEqual([{ index: 2, from: 't-junction', to: 'crossroad' }]);
    expect(result.scene!.pieces[2]).toMatchObject({ piece: 'crossroad', rotation: 0 });
    expect(result.scene!.controls).toEqual([{ type: 'stop', piece: 2, port: 'w' }]); // still the west approach
    expect(buildLaneGraph(result.scene!.pieces).mismatches).toEqual([]);
  });

  it('turns a bend into a T-junction', () => {
    const bent: SceneDefinition = { ...road, pieces: [...road.pieces, { piece: 'bend', at: [5.5, 8.5], rotation: 0 }] }; // west ↔ south
    const result = placePart(bent, { part: 'straight', pointer: [6.4, 8.5], rotation: 0 });
    expect(result.joins).toEqual([{ index: 5, from: 'bend', to: 't-junction' }]);
    expect(buildLaneGraph(result.scene!.pieces).mismatches).toEqual([]);
  });

  it('leaves pieces that can’t take an arm as they are (a pedestrian crossing, a one-way road)', () => {
    const crossing: SceneDefinition = { ...road, pieces: road.pieces.map((p, i) => (i === 2 ? { ...p, piece: 'crossing' } : p)) };
    const beside = placePart(crossing, { part: 'straight', pointer: [2.6, 7.4], rotation: 90 });
    expect(beside.joins).toBeUndefined();
    expect(beside.scene!.pieces[2].piece).toBe('crossing');
    const oneWay: SceneDefinition = { ...road, pieces: road.pieces.map((p) => ({ ...p, flow: { w: 'in', e: 'out' } })) };
    expect(placePart(oneWay, { part: 'straight', pointer: [2.6, 7.4], rotation: 90 }).joins).toBeUndefined();
  });

  it('never snaps a ramp or bridge below the ground to sit beside a road, and neither joins it', () => {
    for (const [part, rotation] of [['bridge', 0], ['bridge', 180], ['ramp', 270], ['ramp-steep', 90]] as const) {
      const result = placePart(road, { part, pointer: [2.6, 7.4], rotation });
      expect(result.placement!.level ?? 0, `${part} at ${rotation}°`).toBeGreaterThanOrEqual(0);
      if (part === 'bridge') expect(result.joins, `${part} at ${rotation}°`).toBeUndefined(); // both ends are raised
    }
    // A ramp whose foot meets the road's side doesn't turn it into a junction (only straights do, P17).
    const foot = placePart(road, { part: 'ramp-steep', pointer: [2.6, 7.4], rotation: 90 });
    expect(foot.joins).toBeUndefined();
    expect(foot.scene?.pieces[2].piece ?? 'straight').toBe('straight');
  });

  it('only a straight road joins: a bend or curve placed against a road leaves it as it is (P17)', () => {
    for (const [part, rotation, pointer] of [['bend', 0, [2.5, 7.5]], ['bend', 90, [2.5, 7.5]], ['curve', 0, [2.5, 7]]] as const) {
      for (const turn of [0, 90, 180, 270] as const) {
        const result = placePart(road, { part, pointer: [...pointer], rotation: ((rotation + turn) % 360) as 0 | 90 | 180 | 270 });
        expect(result.joins, `${part} at ${(rotation + turn) % 360}°`).toBeUndefined();
        if (result.scene) expect(result.scene.pieces[2].piece).toBe('straight');
      }
    }
  });

  it('only a straight laid across an open road end grows the arm', () => {
    // A T-junction (or any non-straight) dropped over the end keeps its own shape.
    const tee = placePart(road, { part: 't-junction', pointer: [5.5, 8.5], rotation: 90 });
    expect(tee.joins).toBeUndefined();
    expect(tee.placement!.piece).toBe('t-junction');
  });

  it('lines straights up into one road when they are dropped one after another, without making junctions', () => {
    // A north–south straight, then four more dropped below it at the default turn (east–west).
    let scene: SceneDefinition = { ...road, pieces: [{ piece: 'straight', at: [10.5, 2.5], rotation: 90 }] };
    for (const z of [3.6, 4.6, 5.6, 6.6]) {
      const result = placePart(scene, { part: 'straight', pointer: [10.5, z], rotation: 0 });
      expect(result.valid, `drop at z ${z}`).toBe(true);
      expect(result.joins, `drop at z ${z}`).toBeUndefined();
      scene = result.scene!;
    }
    expect(scene.pieces.map((p) => p.piece)).toEqual(['straight', 'straight', 'straight', 'straight', 'straight']);
    expect(scene.pieces.map((p) => p.at)).toEqual([[10.5, 2.5], [10.5, 3.5], [10.5, 4.5], [10.5, 5.5], [10.5, 6.5]]);
    const graph = buildLaneGraph(scene.pieces);
    expect(graph.mismatches).toEqual([]);
    expect(graph.openEnds).toHaveLength(2); // one long road: open only at its two ends
  });

  it('never turns the new piece into a junction just because an old road end touches its side', () => {
    // A straight dropped across the road's open east end is turned to continue the road instead.
    const result = placePart(road, { part: 'straight', pointer: [5.5, 8.5], rotation: 90 });
    expect(result.joins).toBeUndefined();
    expect(result.placement).toMatchObject({ piece: 'straight', at: [5.5, 8.5] });
    expect(buildLaneGraph(result.scene!.pieces).openEnds).toHaveLength(1);
  });
});
