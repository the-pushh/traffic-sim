import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import type { SceneDefinition } from '../simulation/network/scene';
import { demandFollowsEntries, EditHistory, moveControl, movePiece, removeControl, removePiece, replaceControl, replacePiece, rotatePiece, setSignalTiming } from './edits';

/** A road with a T-junction at tile 5 (a stop sign on its south arm) and road on to tile 8. */
const scene: SceneDefinition = {
  id: 'test',
  name: 'Test',
  pieces: [
    ...Array.from({ length: 9 }, (_, i) => ({ piece: i === 5 ? 't-junction' : 'straight', at: [i + 0.5, 8.5] as [number, number], rotation: 0 as const })),
    { piece: 'crossroad', at: [12.5, 3.5], rotation: 0 },
  ],
  controls: [
    { type: 'stop', piece: 5, port: 's' },
    { type: 'signal', piece: 9, port: 'n', timing: { green: 20, amber: 3, red: 20, offset: 0 } },
  ],
  demand: { gateways: { A: 1 } },
};

describe('editing a scene', () => {
  it('removes a piece with its controls and keeps the other controls on their pieces', () => {
    const edited = removePiece(scene, 5);
    expect(edited.pieces).toHaveLength(9);
    expect(edited.controls).toEqual([{ type: 'signal', piece: 8, port: 'n', timing: { green: 20, amber: 3, red: 20, offset: 0 } }]);
    expect(edited.pieces[8].piece).toBe('crossroad');
  });

  it('moves a piece with its controls, or refuses with the reason', () => {
    const moved = movePiece(scene, 9, { pointer: [12.5, 1.5] });
    expect(moved.valid).toBe(true);
    const crossroad = moved.scene!.pieces.findIndex((p) => p.piece === 'crossroad');
    expect(moved.scene!.pieces[crossroad].at).toEqual([12.5, 1.5]);
    expect(moved.scene!.controls).toContainEqual({ type: 'signal', piece: crossroad, port: 'n', timing: { green: 20, amber: 3, red: 20, offset: 0 } });
    expect(movePiece(scene, 9, { pointer: [3.5, 8.5] })).toMatchObject({ valid: false, reason: 'Something’s already there' });
  });

  it('rotates a piece in place, and replaces one piece with another keeping the controls that still fit', () => {
    const rotated = rotatePiece(scene, 9);
    expect(rotated.scene!.pieces.find((p) => p.piece === 'crossroad')!.rotation).toBe(90);
    const replaced = replacePiece(scene, 5, 'crossroad');
    expect(replaced.valid).toBe(true);
    expect(replaced.scene!.pieces.find((p) => p.at[0] === 5.5 && p.at[1] === 8.5)!.piece).toBe('crossroad');
    expect(replaced.scene!.controls.filter((c) => c.type === 'stop')).toHaveLength(1);
    expect(buildLaneGraph(replaced.scene!.pieces).mismatches).toEqual([]);
  });

  it('removes a control and changes a signal’s timing', () => {
    expect(removeControl(scene, 0).controls).toHaveLength(1);
    const retimed = setSignalTiming(scene, 1, { green: 30, amber: 3, red: 15, offset: 5 });
    expect(retimed.controls[1].timing).toEqual({ green: 30, amber: 3, red: 15, offset: 5 });
  });

  it('undoes and redoes edits in order, and a new edit clears what could be redone', () => {
    const history = new EditHistory(scene);
    const a = removeControl(scene, 0);
    const b = removePiece(a, 0);
    history.push(a);
    history.push(b);
    expect(history.undo()).toBe(a);
    expect(history.undo()).toBe(scene);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBe(a);
    history.push(b);
    expect(history.redo()).toBeNull();
    expect(history.canUndo()).toBe(true);
  });
});

describe('editing a scene: demand follows the entries', () => {
  // A road across the board (gateways at both edges) and a side road to the north edge from a T at tile 8.
  const base: SceneDefinition = {
    id: 'demand',
    name: 'Demand',
    pieces: [
      ...Array.from({ length: 16 }, (_, i) => ({ piece: i === 8 ? 't-junction' : 'straight', at: [i + 0.5, 8.5] as [number, number], rotation: 180 as const })),
    ],
    controls: [],
    demand: { gateways: {}, destinations: {} },
  };
  const graph = buildLaneGraph(base.pieces);
  const label = (g: typeof graph, x: number) => g.gateways.find((w) => w.at[0] === x)!.label;
  const westLabel = label(graph, 0);
  const eastLabel = label(graph, 16);
  const scene: SceneDefinition = { ...base, demand: { gateways: { [westLabel]: 1, [eastLabel]: 0.5 }, destinations: { [eastLabel]: 1 } } };

  it('keeps each entry’s demand on the same road end when an edit adds an entry and the letters move', () => {
    // A side road up to the north edge adds a gateway that comes first clockwise.
    const withSide: SceneDefinition = { ...scene, pieces: [...scene.pieces, ...Array.from({ length: 8 }, (_, z) => ({ piece: 'straight', at: [8.5, z + 0.5] as [number, number], rotation: 90 as const }))] };
    const followed = demandFollowsEntries(scene, withSide);
    const g = buildLaneGraph(followed.pieces);
    expect(followed.demand.gateways).toEqual({ [label(g, 0)]: 1, [label(g, 16)]: 0.5 });
    expect(followed.demand.destinations).toEqual({ [label(g, 16)]: 1 });
  });

  it('drops demand for an entry the edit removed', () => {
    const shorter: SceneDefinition = { ...scene, pieces: scene.pieces.filter((p) => p.at[0] !== 15.5) };
    expect(Object.keys(demandFollowsEntries(scene, shorter).demand.gateways)).toHaveLength(1);
  });
});

describe('editing changes how vehicles use the network', () => {
  it('a stop sign dropped on the side road makes its drivers stop at the line', async () => {
    const { placePart } = await import('./placement');
    const { resolveControls } = await import('../simulation/traffic/signals');
    const { TrafficSimulation } = await import('../simulation/traffic/trafficSimulation');
    // A road across the board with a T (south arm) at tile 8 and a side road to the south edge.
    const pieces = [
      ...Array.from({ length: 16 }, (_, i) => ({ piece: i === 8 ? 't-junction' : 'straight', at: [i + 0.5, 8.5] as [number, number], rotation: 0 as const })),
      ...Array.from({ length: 7 }, (_, z) => ({ piece: 'straight', at: [8.5, z + 9.5] as [number, number], rotation: 90 as const })),
    ];
    const plain: SceneDefinition = { id: 't', name: 'T', pieces, controls: [], demand: { gateways: {} } };
    const result = placePart(plain, { part: 'stop', pointer: [8.5, 9.1], rotation: 0 });
    expect(result.control).toEqual({ type: 'stop', piece: 8, port: 's' });
    const reasons = (scene: SceneDefinition) => {
      const graph = buildLaneGraph(scene.pieces);
      const s = new TrafficSimulation(graph, { seed: 1, controls: resolveControls(scene.pieces, graph, scene.controls) });
      const south = graph.gateways.find((g) => g.at[1] === 16)!.label;
      const west = graph.gateways.find((g) => g.at[0] === 0)!.label;
      const car = s.addVehicle({ type: 'sedan', profile: 'cautious', from: south, to: west, position: 30, speed: 10 });
      s.vehicle(car).driver.compliance = 1;
      const seen = new Set<string>();
      for (let i = 0; i < 15 * 30 && s.has(car); i++) {
        s.step(1 / 30);
        if (s.has(car)) seen.add(s.vehicle(car).reason);
      }
      return seen;
    };
    expect(reasons(plain).has('Stop sign')).toBe(false);
    expect(reasons(result.scene!).has('Stop sign')).toBe(true);
  });

  it('puts a moved piece last, which is how the editor keeps it selected', () => {
    const moved = movePiece(scene, 0, { pointer: [0.5, 2.5] });
    expect(moved.scene!.pieces.at(-1)!.at).toEqual([0.5, 2.5]);
  });
});

describe('editing controls', () => {
  it('replaces a control with another kind on the same approach', () => {
    const replaced = replaceControl(scene, 0, 'yield');
    expect(replaced.controls[0]).toEqual({ type: 'yield', piece: 5, port: 's' });
    const signal = replaceControl(scene, 0, 'signal');
    expect(signal.controls[0].timing).toBeDefined();
  });

  it('moves a control to another approach, keeping a signal’s timing, or refuses with the reason', () => {
    const moved = moveControl(scene, 1, { pointer: [12.5, 4.1] });
    expect(moved.valid).toBe(true);
    expect(moved.scene!.controls.at(-1)).toEqual({ type: 'signal', piece: 9, port: 's', timing: { green: 20, amber: 3, red: 20, offset: 0 } });
    expect(moved.scene!.controls).toHaveLength(2);
    expect(moveControl(scene, 1, { pointer: [2, 2] })).toMatchObject({ valid: false, reason: 'Drop it where a road enters a junction' });
  });

  it('only grows junctions for newly placed pieces: moving or turning a piece beside a road leaves the road as it is', () => {
    const road: SceneDefinition = {
      id: 'join',
      name: 'Join',
      pieces: [
        ...Array.from({ length: 5 }, (_, i) => ({ piece: 'straight', at: [i + 0.5, 8.5] as [number, number], rotation: 0 as const })),
        { piece: 'straight', at: [2.5, 6.5], rotation: 0 }, // a lone straight two tiles north
      ],
      controls: [],
      demand: { gateways: { A: 1 } },
    };
    const moved = movePiece(road, 5, { pointer: [2.5, 7.5], rotation: 90 });
    expect(moved.joins).toBeUndefined();
    expect(moved.scene!.pieces[2].piece).toBe('straight');
    const turned = rotatePiece({ ...road, pieces: road.pieces.map((p, i) => (i === 5 ? { ...p, at: [2.5, 7.5] as [number, number] } : p)) }, 5);
    expect(turned.joins).toBeUndefined();
    expect(turned.scene!.pieces.some((p) => p.piece === 't-junction')).toBe(false);
  });
});
