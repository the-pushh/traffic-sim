import { describe, expect, it } from 'vitest';
import { countdown, runProgress } from './hudCountdown';

describe('the HUD countdown', () => {
  it('names the run length before the run starts', () => {
    expect(countdown({ state: 'ready', clock: 0, duration: 60 })).toBe('1:00 run');
    expect(countdown({ state: 'ready', clock: 0, duration: 30 })).toBe('0:30 run');
    expect(countdown({ state: 'ready', clock: 0, duration: 90 })).toBe('1:30 run');
  });

  it('counts down whole seconds left while running and while paused', () => {
    expect(countdown({ state: 'running', clock: 0, duration: 60 })).toBe('60 s left');
    expect(countdown({ state: 'running', clock: 18, duration: 60 })).toBe('42 s left');
    // A part-second still to go counts as a second left: it never shows 0 before the end.
    expect(countdown({ state: 'running', clock: 59.9, duration: 60 })).toBe('1 s left');
    expect(countdown({ state: 'paused', clock: 18.5, duration: 60 })).toBe('42 s left');
  });

  it('says the run is complete at the end', () => {
    expect(countdown({ state: 'ended', clock: 60, duration: 60 })).toBe('Run complete');
  });
});

describe('the Play ring', () => {
  it('fills with simulated time: empty before, half way, full at the end', () => {
    expect(runProgress({ state: 'ready', clock: 0, duration: 60 })).toBe(0);
    expect(runProgress({ state: 'running', clock: 30, duration: 60 })).toBe(0.5);
    expect(runProgress({ state: 'ended', clock: 60, duration: 60 })).toBe(1);
  });
});
