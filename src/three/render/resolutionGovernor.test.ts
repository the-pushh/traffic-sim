import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from './resolutionGovernor';

/** Feed `count` frames that each took `ms`; returns the pixel ratio afterwards. */
const frames = (governor: ResolutionGovernor, count: number, ms: number) => {
  for (let i = 0; i < count; i++) governor.frame(ms);
  return governor.pixelRatio;
};

describe('resolution governor', () => {
  it('keeps the screen’s full sharpness while frames keep up', () => {
    const governor = new ResolutionGovernor(2);
    expect(frames(governor, 600, 16.7)).toBe(2);
  });

  it('draws fewer pixels, a step at a time, when the computer can’t keep up', () => {
    const governor = new ResolutionGovernor(2);
    expect(frames(governor, 60, 33)).toBe(1.5);
    expect(frames(governor, 60, 33)).toBe(1);
    expect(frames(governor, 600, 50)).toBe(1); // never below one pixel per screen pixel
  });

  it('shrugs off a single hitch', () => {
    const governor = new ResolutionGovernor(2);
    frames(governor, 59, 16.7);
    governor.frame(120);
    expect(frames(governor, 60, 16.7)).toBe(2);
  });

  it('starts sharp again when a scene opens (frame times can’t show spare capacity at the screen’s refresh rate)', () => {
    const governor = new ResolutionGovernor(2);
    frames(governor, 60, 33);
    expect(governor.pixelRatio).toBe(1.5);
    governor.reset();
    expect(governor.pixelRatio).toBe(2);
  });

  it('starts at 1 on a screen with fewer pixels', () => {
    expect(new ResolutionGovernor(1).pixelRatio).toBe(1);
    expect(new ResolutionGovernor(3).pixelRatio).toBe(2); // capped, as before
  });
});
