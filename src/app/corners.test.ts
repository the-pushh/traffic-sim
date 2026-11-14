import { describe, expect, it } from 'vitest';
import { cornerRadius, shortSide } from './corners';

describe('shared corner rounding', () => {
  it('rounds by the shorter side, so a narrow and a wide button of the same height match', () => {
    expect(cornerRadius(shortSide(44, 44)!, 0.2)).toBeCloseTo(8.8);
    expect(cornerRadius(shortSide(220, 44)!, 0.2)).toBeCloseTo(8.8);
  });

  it('rounds a large card more, in proportion to its shorter side', () => {
    expect(cornerRadius(shortSide(600, 220)!, 0.2)).toBeCloseTo(44);
  });

  it('measures nothing for a hidden element (no size), rather than a zero radius flash', () => {
    expect(shortSide(0, 120)).toBeNull();
    expect(shortSide(120, 0)).toBeNull();
  });
});
