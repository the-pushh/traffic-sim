import { describe, expect, it } from 'vitest';
import { signalTest } from '../../scenes/signalTest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import { RunController } from '../runController';
import { TrafficSession } from './trafficSession';

const graph = buildLaneGraph(signalTest.pieces);
const state = (session: TrafficSession) =>
  session.simulation.allVehicles().map((v) => `${v.type.id}:${v.driver.profile}:${v.driver.headway.toFixed(9)}:${session.simulation.routeProgress(v.id).toFixed(9)}`);

describe('traffic session', () => {
  it('opens with warmed-up traffic on the roads but counts nothing until the run starts', () => {
    const session = new TrafficSession(signalTest, graph, new RunController());

    expect(session.simulation.allVehicles().length).toBeGreaterThan(0);
    expect(session.simulation.counts).toEqual({ due: 0, entered: 0, finished: 0, waiting: 0, blocked: 0 });
    expect(session.simulation.travelTimes).toEqual([]);
  });

  it('replays exactly the same traffic after Restart', () => {
    const run = new RunController();
    const session = new TrafficSession(signalTest, graph, run);
    const opening = state(session);
    run.play();
    session.advance(run.tick(12));
    expect(state(session)).not.toEqual(opening);

    run.restart();
    session.advance(run.tick(0));
    expect(state(session)).toEqual(opening);
  });

  it('keeps the same simulation when Play continues after a run ends', () => {
    const run = new RunController();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(30));
    const atEnd = session.simulation;
    run.play();
    session.advance(run.tick(1));
    expect(session.simulation).toBe(atEnd);
  });
});

describe('traffic session measures', () => {
  it('reports the run’s measures with its scene, intensity and duration, and live queues per approach', () => {
    const run = new RunController();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(30));
    expect(run.state).toBe('ended');
    const results = session.results();
    expect(results).toMatchObject({ scene: 'Signal test', intensity: 'medium', duration: 30 });
    expect(results.due).toBe(session.simulation.counts.due);
    expect(results.peakQueues.map((q) => q.approach)).toEqual(['Crossing 1 · eastbound', 'Crossing 1 · westbound']);
    expect(results.peakQueues.some((q) => q.peak > 0)).toBe(true);
    expect(session.liveQueues().map((q) => q.approach.name)).toEqual(['Crossing 1 · eastbound', 'Crossing 1 · westbound']);
  });

  it('after a signal timing change and Restart, replays the same arrivals, drivers and vehicles with a different outcome', () => {
    const arrivals = (scene: typeof signalTest) => {
      const run = new RunController();
      run.setDuration(60);
      const session = new TrafficSession(scene, graph, run);
      run.play();
      const seen = new Map<number, string>();
      for (let t = 0; t < 60; t += 0.5) {
        session.advance(run.tick(0.5));
        for (const v of session.simulation.allVehicles()) if (!seen.has(v.id)) seen.set(v.id, `${v.type.id}:${v.driver.profile}:${v.driver.headway.toFixed(9)}:${v.destination}`);
      }
      return { seen: [...seen.values()], results: session.results() };
    };
    const before = arrivals(signalTest);
    // Shorter reds at the crossing.
    const retimed = { ...signalTest, controls: signalTest.controls.map((c) => ({ ...c, timing: { green: 25, amber: 3, red: 6, offset: 0 } })) };
    const after = arrivals(retimed);
    expect(after.results.due).toBe(before.results.due);
    // The same trips (vehicle, driver, destination) arrive; only when each gets through differs.
    const shared = after.seen.filter((trip) => before.seen.includes(trip)).length;
    expect(shared).toBeGreaterThan(before.seen.length * 0.85);
    const peak = (r: typeof before.results) => Math.max(...r.peakQueues.map((q) => q.peak));
    expect(peak(after.results) !== peak(before.results) || after.results.averageTravelTime !== before.results.averageTravelTime).toBe(true);
    expect(peak(after.results)).toBeLessThan(peak(before.results));
  });
});

describe('traffic session: continuing after the end', () => {
  it('measures the continued run on its own', () => {
    const run = new RunController();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(30));
    const first = session.results();
    expect(first.due).toBeGreaterThan(0);
    run.play(); // continue
    session.advance(run.tick(1));
    expect(session.results().due).toBeLessThan(first.due);
  });
});
