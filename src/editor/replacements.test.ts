import { describe, expect, it } from 'vitest';
import type { SceneDefinition } from '../simulation/network/scene';
import { replacementsFor } from './replacements';

const row: SceneDefinition = {
  id: 'row',
  name: 'Row',
  pieces: [3.5, 4.5, 5.5].map((x) => ({ piece: 'straight', at: [x, 8.5] as [number, number], rotation: 0 as const })),
  controls: [],
  demand: { gateways: {} },
};

describe('replacements for a piece', () => {
  const options = replacementsFor(row, 1);

  it('puts the parts that fit and keep every connection first', () => {
    const first = options.slice(0, 4).map((o) => o.part);
    expect(first).toEqual(expect.arrayContaining(['crossing', 'driveway', 't-junction', 'crossroad']));
    expect(options[0]).toMatchObject({ fits: true, kept: 2, broken: 0 });
  });

  it('never offers the piece itself or controls, and ranks parts that break connections after those that keep them', () => {
    expect(options.map((o) => o.part)).not.toContain('straight');
    expect(options.map((o) => o.part)).not.toContain('signal');
    const bend = options.findIndex((o) => o.part === 'bend');
    const crossroad = options.findIndex((o) => o.part === 'crossroad');
    expect(options[bend]).toMatchObject({ fits: true, kept: 1, broken: 1 });
    expect(bend).toBeGreaterThan(crossroad);
  });

  it('lists parts that can’t go there last, with the reason', () => {
    const roundabout = options.find((o) => o.part === 'roundabout')!;
    expect(roundabout.fits).toBe(false);
    expect(roundabout.reason).toBeTruthy();
    const fitting = options.filter((o) => o.fits).length;
    expect(options.slice(fitting).every((o) => !o.fits)).toBe(true);
  });
});
