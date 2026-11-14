import { describe, expect, it } from 'vitest';
import type { SceneDefinition } from '../simulation/network/scene';
import { connectionChange, roadEndsOf } from './connections';
import { replacePiece, turnPiece } from './edits';

/** Three straight roads in a row, west to east, in the middle of the board. */
const row: SceneDefinition = {
  id: 'row',
  name: 'Row',
  pieces: [3.5, 4.5, 5.5].map((x) => ({ piece: 'straight', at: [x, 8.5] as [number, number], rotation: 0 as const })),
  controls: [],
  demand: { gateways: {} },
};

describe('a road piece’s connections', () => {
  it('lists its road ends, and which meet another piece', () => {
    expect(roadEndsOf(row, 1)).toEqual([
      { at: [4, 0, 8.5], connected: true },
      { at: [5, 0, 8.5], connected: true },
    ]);
    expect(roadEndsOf(row, 0).filter((e) => e.connected)).toEqual([{ at: [4, 0, 8.5], connected: true }]);
  });

  it('turning the middle road a quarter breaks both its connections', () => {
    const turned = turnPiece(row, 1, 90);
    expect(turned.valid).toBe(true);
    const change = connectionChange(row, 1, turned.scene!, turned.scene!.pieces.length - 1);
    expect(change.kept).toEqual([]);
    expect(change.broken).toEqual([
      [4, 0, 8.5],
      [5, 0, 8.5],
    ]);
  });

  it('a half turn keeps both: the road still runs west to east', () => {
    const turned = turnPiece(row, 1, 180);
    const change = connectionChange(row, 1, turned.scene!, turned.scene!.pieces.length - 1);
    expect(change.kept).toHaveLength(2);
    expect(change.broken).toEqual([]);
  });

  it('replacing it with a T-junction keeps both; with a bend, keeps one and breaks one', () => {
    const t = replacePiece(row, 1, 't-junction');
    expect(connectionChange(row, 1, t.scene!, t.scene!.pieces.length - 1)).toEqual({ kept: [[4, 0, 8.5], [5, 0, 8.5]], broken: [], made: [] });
    const bend = replacePiece(row, 1, 'bend');
    expect(connectionChange(row, 1, bend.scene!, bend.scene!.pieces.length - 1)).toEqual({ kept: [[4, 0, 8.5]], broken: [[5, 0, 8.5]], made: [] });
  });
});
