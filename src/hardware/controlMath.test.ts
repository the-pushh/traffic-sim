import { describe, expect, it } from 'vitest';
import { clampTilt, detentAngle, nearestDetent, travelPosition, travelValue } from './controlMath';

describe('hardware control math', () => {
  it('snaps a continuous position to the nearest of five detents', () => {
    expect(nearestDetent(0, 5)).toBe(0);
    expect(nearestDetent(0.12, 5)).toBe(0);
    expect(nearestDetent(0.13, 5)).toBe(1);
    expect(nearestDetent(0.5, 5)).toBe(2);
    expect(nearestDetent(1.4, 5)).toBe(4); // past the end stays at the last detent
    expect(nearestDetent(-0.3, 5)).toBe(0);
  });

  it('spreads the knob’s five detents evenly over its sweep, centred on twelve o’clock', () => {
    expect([0, 1, 2, 3, 4].map((i) => detentAngle(i, 5, 240))).toEqual([-120, -60, 0, 60, 120]);
  });

  it('puts the slider cap’s ends of travel exactly on the first and last scale marks', () => {
    const track = { start: 14, end: 286 }; // the first and last marks, px
    expect(travelPosition(0, 30, track)).toBe(14);
    expect(travelPosition(30, 30, track)).toBe(286);
    expect(travelPosition(15, 30, track)).toBe(150);
    expect(travelValue(150, 30, track)).toBe(15);
    expect(travelValue(0, 30, track)).toBe(0); // dragged past the end
    expect(travelValue(400, 30, track)).toBe(30);
  });

  it('limits the stick’s tilt to a circle, keeping its direction', () => {
    expect(clampTilt(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 });
    const pushed = clampTilt(3, 4);
    expect(pushed.x).toBeCloseTo(0.6);
    expect(pushed.y).toBeCloseTo(0.8);
  });
});
