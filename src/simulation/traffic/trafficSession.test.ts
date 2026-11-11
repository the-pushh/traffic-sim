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
    expect(session.simulation.counts).toEqual({ due: 0, entered: 0, finished: 0, waiting: 0 });
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
