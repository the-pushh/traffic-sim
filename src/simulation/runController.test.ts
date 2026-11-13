import { describe, expect, it } from 'vitest';
import { RunController } from './runController';

describe('run controller', () => {
  it('starts ready at 0:00 with the 30 s duration and settings unlocked', () => {
    const run = new RunController();

    expect(run.state).toBe('ready');
    expect(run.clock).toBe(0);
    expect(run.duration).toBe(30);
    expect(run.settingsLocked).toBe(false);
  });

  it('advances in fixed 1/30 s steps and ends exactly at the chosen duration', () => {
    const run = new RunController();
    run.play();
    expect(run.state).toBe('running');

    let steps = run.tick(10);
    expect(steps).toBe(300);
    expect(run.clock).toBeCloseTo(10, 9);

    steps += run.tick(25); // overshoots the 30 s run
    expect(steps).toBe(900);
    expect(run.clock).toBe(30);
    expect(run.state).toBe('ended');
    expect(run.tick(5)).toBe(0);
  });

  it('carries fractions of a step between frames', () => {
    const run = new RunController();
    run.play();
    let steps = 0;
    for (let frame = 0; frame < 60; frame++) steps += run.tick(1 / 60);
    expect(steps).toBe(30);
    expect(run.clock).toBeCloseTo(1, 9);
  });

  it('holds the clock while paused', () => {
    const run = new RunController();
    run.play();
    run.tick(4);
    run.pause();

    expect(run.state).toBe('paused');
    expect(run.tick(10)).toBe(0);
    expect(run.clock).toBeCloseTo(4, 9);

    run.play();
    run.tick(1);
    expect(run.clock).toBeCloseTo(5, 9);
  });

  it('locks intensity and duration for the whole run, playing or paused, and unlocks when it ends', () => {
    const run = new RunController();
    expect(run.setDuration(60)).toBe(true);
    expect(run.setIntensity('high')).toBe(true);

    run.play();
    expect(run.settingsLocked).toBe(true);
    expect(run.setDuration(90)).toBe(false);
    run.pause();
    expect(run.settingsLocked).toBe(true);
    expect(run.setIntensity('congested')).toBe(false);
    expect(run.duration).toBe(60);
    expect(run.intensity).toBe('high');

    run.play();
    run.tick(61);
    expect(run.state).toBe('ended');
    expect(run.settingsLocked).toBe(false);
    expect(run.setDuration(30)).toBe(true);
  });

  it('tells the simulation whether Play starts, resumes, or continues after the end', () => {
    const run = new RunController();
    expect(run.play()).toBe('start');
    run.pause();
    expect(run.play()).toBe('resume');
    run.tick(30);
    expect(run.state).toBe('ended');

    expect(run.play()).toBe('continue');
    expect(run.state).toBe('running');
    expect(run.clock).toBe(0);
    expect(run.tick(30)).toBe(900);
    expect(run.state).toBe('ended');
  });

  it('restarts back to ready at 0:00 from any state, unlocking the settings', () => {
    for (const reach of ['running', 'paused', 'ended'] as const) {
      const run = new RunController();
      run.play();
      run.tick(reach === 'ended' ? 30 : 3);
      if (reach === 'paused') run.pause();
      expect(run.state).toBe(reach);

      run.restart();

      expect(run.state).toBe('ready');
      expect(run.clock).toBe(0);
      expect(run.settingsLocked).toBe(false);
      expect(run.play()).toBe('start');
    }
  });

  it('goes back to ready when intensity or duration changes after a run ends, so the next Play starts fresh', () => {
    for (const change of [(r: RunController) => r.setIntensity('congested'), (r: RunController) => r.setDuration(60)]) {
      const run = new RunController();
      run.play();
      run.tick(30);
      expect(run.state).toBe('ended');

      expect(change(run)).toBe(true);

      expect(run.state).toBe('ready');
      expect(run.clock).toBe(0);
      expect(run.play()).toBe('start');
    }
  });

  it('keeps an ended run as it is when the chosen setting is unchanged', () => {
    const run = new RunController();
    run.play();
    run.tick(30);
    run.setDuration(30);
    run.setIntensity('medium');
    expect(run.state).toBe('ended');
    expect(run.clock).toBe(30);
  });

  it('ignores negative or non-finite frame times', () => {
    const run = new RunController();
    run.play();
    run.tick(2);
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(run.tick(bad)).toBe(0);
    expect(run.clock).toBeCloseTo(2, 9);
    expect(run.state).toBe('running');
  });

  it('counts fresh starts, so the simulation knows when to rebuild its starting traffic', () => {
    const run = new RunController();
    expect(run.freshStarts).toBe(0);

    run.setIntensity('high'); // in Ready: new starting traffic for the new intensity
    expect(run.freshStarts).toBe(1);
    run.play();
    run.pause();
    run.play(); // resume: same traffic
    expect(run.freshStarts).toBe(1);
    run.tick(30);
    run.play(); // continue after the end: same traffic
    expect(run.freshStarts).toBe(1);
    run.restart();
    expect(run.freshStarts).toBe(2);
    run.setDuration(60); // a new duration needs no new traffic
    expect(run.freshStarts).toBe(2);
  });

  describe('scrubbing the timeline', () => {
    const at = (seconds: number) => {
      const run = new RunController();
      run.play();
      run.tick(seconds);
      return run;
    };

    it('jumps forward by simulating the steps in between, and leaves the run paused there', () => {
      const run = at(10);
      expect(run.seek(20)).toEqual({ rewind: false, steps: 300 });
      expect(run.clock).toBe(20);
      expect(run.state).toBe('paused');
    });

    it('jumps back by starting the same traffic again and replaying to that moment', () => {
      const run = at(10);
      const fresh = run.freshStarts;
      expect(run.seek(4)).toEqual({ rewind: true, steps: 120 });
      expect(run.freshStarts).toBe(fresh + 1);
      expect(run.clock).toBe(4);
      expect(run.state).toBe('paused');
    });

    it('ends the run when dragged to the end, and is Ready again at 0:00', () => {
      const run = at(10);
      run.seek(45);
      expect(run.clock).toBe(30);
      expect(run.state).toBe('ended');
      run.seek(0);
      expect(run.clock).toBe(0);
      expect(run.state).toBe('ready');
    });

    it('can scrub from Ready into the run', () => {
      const run = new RunController();
      expect(run.seek(3)).toEqual({ rewind: false, steps: 90 });
      expect(run.state).toBe('paused');
    });
  });
});

