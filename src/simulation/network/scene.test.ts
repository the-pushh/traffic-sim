import { describe, expect, it } from 'vitest';
import { type SceneDefinition, validateScene } from './scene';

const base: SceneDefinition = {
  id: 'test',
  name: 'Test',
  pieces: [
    { piece: 'straight', at: [7.5, 8.5], rotation: 0 },
    { piece: 'crossroad', at: [8.5, 8.5], rotation: 0 },
  ],
  controls: [{ type: 'signal', piece: 1, port: 'w' }],
  demand: { gateways: {} },
};

describe('scene format', () => {
  it('accepts a scene whose pieces exist, sit on the board, and whose controls are on real approaches', () => {
    expect(validateScene(base)).toEqual([]);
  });

  it('explains what is wrong with an invalid scene', () => {
    const errors = validateScene({
      ...base,
      pieces: [...base.pieces, { piece: 'hovercraft-lane', at: [3.5, 3.5], rotation: 0 }, { piece: 'straight', at: [16.5, 3.5], rotation: 0 }],
      controls: [
        { type: 'stop', piece: 1, port: 'up' },
        { type: 'yield', piece: 9, port: 'w' },
      ],
    });

    expect(errors).toEqual([
      'Piece 2: unknown piece "hovercraft-lane"',
      'Piece 3: straight at (16.5, 3.5) is off the 16 × 16 board',
      'Control 0: crossroad has no approach "up"',
      'Control 1: there is no piece 9',
    ]);
  });

  it('rejects rotations that are not quarter turns', () => {
    const errors = validateScene({ ...base, pieces: [{ piece: 'straight', at: [7.5, 8.5], rotation: 45 as 0 }], controls: [] });
    expect(errors).toEqual(['Piece 0: rotation must be 0, 90, 180 or 270']);
  });
});
