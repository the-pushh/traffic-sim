import { describe, expect, it } from 'vitest';
import { mainStreet } from '../../scenes/mainStreet';
import { signalTest } from '../../scenes/signalTest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import { RunController } from '../runController';
import { TrafficSession } from './trafficSession';

const graph = buildLaneGraph(signalTest.pieces);
const state = (session: TrafficSession) =>
  session.simulation.allVehicles().map((v) => `${v.type.id}:${v.driver.profile}:${v.driver.headway.toFixed(9)}:${session.simulation.routeProgress(v.id).toFixed(9)}`);

/** A run of 30 s: these tests were written for that length (the app's default is 60 s since P20). */
function thirtySecondRun() {
  const run = new RunController();
  run.setDuration(30);
  return run;
}

describe('traffic session', () => {
  it('opens with warmed-up traffic on the roads but counts nothing until the run starts', () => {
    const session = new TrafficSession(signalTest, graph, thirtySecondRun());

    expect(session.simulation.allVehicles().length).toBeGreaterThan(0);
    expect(session.simulation.counts).toEqual({ due: 0, entered: 0, finished: 0, waiting: 0, blocked: 0 });
    expect(session.simulation.travelTimes).toEqual([]);
  });

  it('replays exactly the same traffic after Restart', () => {
    const run = thirtySecondRun();
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
    const run = thirtySecondRun();
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
    const run = thirtySecondRun();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(30));
    expect(run.state).toBe('ended');
    const results = session.results();
    expect(results).toMatchObject({ scene: 'Signal test', intensity: 'medium', duration: 30 });
    expect(results.due).toBe(session.simulation.counts.due);
    expect(results.peakQueues.map((q) => q.approach)).toEqual(['Crossing 1 · eastbound', 'Crossing 1 · westbound']);
    expect(results.peakQueues.some((q) => q.peak > 0)).toBe(true);
    expect(session.approaches.map((a) => a.name)).toEqual(['Crossing 1 · eastbound', 'Crossing 1 · westbound']);
    expect(session.liveQueues()).toHaveLength(2);
  });

  it('after a signal timing change and Restart, replays exactly the same arrivals, drivers and vehicles with a different outcome', () => {
    const msGraph = buildLaneGraph(mainStreet.pieces);
    const run = thirtySecondRun();
    run.setDuration(60);
    const play = (session: TrafficSession) => {
      run.play();
      while (run.state === 'running') session.advance(run.tick(0.5));
      return { arrivals: session.simulation.arrivals.map((a) => ({ ...a })), results: session.results() };
    };
    const before = play(new TrafficSession(mainStreet, msGraph, run));
    // As the editor will: change the middle junction's timing, then press Restart.
    const retimed = { ...mainStreet, controls: mainStreet.controls.map((c, i) => (i >= 4 && i < 8 ? { ...c, timing: { green: 10, amber: 3, red: 47, offset: 0 } } : c)) };
    run.restart();
    const after = play(new TrafficSession(retimed, msGraph, run));
    expect(after.arrivals).toEqual(before.arrivals);
    expect(after.results.due).toBe(before.results.due);
    const peaks = (r: typeof before.results) => r.peakQueues.map((q) => q.peak);
    expect(peaks(after.results)).not.toEqual(peaks(before.results));
  });
});

describe('traffic session: continuing after the end', () => {
  it('measures the continued run on its own', () => {
    const run = thirtySecondRun();
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

describe('traffic session: edits', () => {
  // Signal test with its crossing replaced by plain road: the light is gone.
  const withoutLight = { ...signalTest, pieces: signalTest.pieces.map((p) => (p.piece === 'crossing' ? { ...p, piece: 'straight' } : p)), controls: [] };

  it('carries a paused run on over the edited network', () => {
    const run = thirtySecondRun();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(10));
    run.pause();
    const before = { time: session.simulation.time, due: session.simulation.counts.due, vehicles: session.simulation.allVehicles().length };
    session.edit(withoutLight, buildLaneGraph(withoutLight.pieces));
    expect(run.state).toBe('paused');
    expect(session.simulation.time).toBe(before.time);
    expect(session.simulation.counts.due).toBe(before.due);
    expect(session.simulation.allVehicles()).toHaveLength(before.vehicles);
    expect(session.approaches).toEqual([]);
    run.play();
    session.advance(run.tick(5));
    expect(session.simulation.allVehicles().every((v) => v.reason !== 'Red light')).toBe(true);
  });

  it('starts afresh from Ready when edited before a run or after it ends', () => {
    const run = thirtySecondRun();
    const session = new TrafficSession(signalTest, graph, run);
    run.play();
    session.advance(run.tick(30));
    expect(run.state).toBe('ended');
    session.edit(withoutLight, buildLaneGraph(withoutLight.pieces));
    expect(run.state).toBe('ready');
    expect(session.simulation.counts.due).toBe(0);
    expect(session.results().scene).toBe('Signal test');
  });
});

describe('traffic session: edits in Ready', () => {
  it('warms the edited network up afresh, staying in Ready', () => {
    const run = thirtySecondRun();
    const session = new TrafficSession(signalTest, graph, run);
    const withoutLight = { ...signalTest, pieces: signalTest.pieces.map((p) => (p.piece === 'crossing' ? { ...p, piece: 'straight' } : p)), controls: [] };
    session.edit(withoutLight, buildLaneGraph(withoutLight.pieces));
    expect(run.state).toBe('ready');
    expect(session.simulation.allVehicles().length).toBeGreaterThan(0);
    expect(session.simulation.counts.due).toBe(0);
    expect(session.approaches).toEqual([]);
  });
});
