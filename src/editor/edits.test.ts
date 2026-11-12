import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import type { SceneDefinition } from '../simulation/network/scene';
import { EditHistory, movePiece, removeControl, removePiece, replacePiece, rotatePiece, setSignalTiming } from './edits';

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
