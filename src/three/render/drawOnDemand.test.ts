import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { DrawOnDemand, type FrameState } from './drawOnDemand';

const simulation = {};
const frame = (over: Partial<FrameState> = {}): FrameState => ({
  view: new Matrix4(),
  projection: new Matrix4(),
  traffic: simulation,
  time: 12,
  state: 'ready',
  ...over,
});

describe('drawing the map only when it changes', () => {
  it('draws the first frame, then nothing while the map stands still', () => {
    const draws = new DrawOnDemand();
    expect(draws.changed(frame())).toBe(true);
    expect(draws.changed(frame())).toBe(false);
    expect(draws.changed(frame())).toBe(false);
  });

  it('draws when the camera moves or the view is resized', () => {
    const draws = new DrawOnDemand();
    draws.changed(frame());
    expect(draws.changed(frame({ view: new Matrix4().makeTranslation(1, 0, 0) }))).toBe(true);
    expect(draws.changed(frame({ view: new Matrix4().makeTranslation(1, 0, 0) }))).toBe(false);
    expect(draws.changed(frame({ projection: new Matrix4().makeScale(2, 1, 1) }))).toBe(true);
  });

  it('draws when traffic moves, the run changes, or a fresh run starts', () => {
    const draws = new DrawOnDemand();
    draws.changed(frame());
    expect(draws.changed(frame({ time: 12.1 }))).toBe(true); // a simulation step
    expect(draws.changed(frame({ time: 12.1, state: 'paused' }))).toBe(true);
    expect(draws.changed(frame({ time: 12.1, state: 'paused', traffic: {} }))).toBe(true); // Restart, a new load, an edit
  });

  it('draws once when asked (a scene swap, an edit, a restored GPU context)', () => {
    const draws = new DrawOnDemand();
    draws.changed(frame());
    draws.request();
    expect(draws.changed(frame())).toBe(true);
    expect(draws.changed(frame())).toBe(false);
  });
});
