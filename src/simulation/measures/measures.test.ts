import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import type { ControlPlacement, PiecePlacement } from '../network/scene';
import { resolveControls } from '../traffic/signals';
import { TrafficSimulation } from '../traffic/trafficSimulation';
import { describeApproaches, QueueTracker, summariseRun } from './measures';

const STEP = 1 / 30;
const CROSSING = 8;
// One road west–east with a signalled crossing in the middle. Gateways: A east, B west.
const pieces: PiecePlacement[] = Array.from({ length: 16 }, (_, i): PiecePlacement => ({ piece: i === CROSSING ? 'crossing' : 'straight', at: [i + 0.5, 8.5], rotation: 0 }));
const graph = buildLaneGraph(pieces);
// Red for the first 30 s, then green.
const RED_FIRST = { green: 60, amber: 3, red: 30, offset: 63 };
const placements: ControlPlacement[] = [
  { type: 'signal', piece: CROSSING, port: 'w', timing: RED_FIRST },
  { type: 'signal', piece: CROSSING, port: 'e', timing: RED_FIRST },
];
const controls = resolveControls(pieces, graph, placements);

function run(s: TrafficSimulation, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s.step(STEP);
    each?.();
  }
}

describe('measures', () => {
  it('names each approach by its junction and the direction traffic arrives in', () => {
    expect(describeApproaches(pieces, graph, controls).map((a) => a.name)).toEqual(['Crossing 1 · eastbound', 'Crossing 1 · westbound']);
  });

  it('counts the vehicles queued at each approach, live and at their peak', () => {
    const s = new TrafficSimulation(graph, { seed: 1, controls });
    // Four cars heading east towards the red light; nothing westbound.
    for (let i = 0; i < 4; i++) s.addVehicle({ type: 'sedan', profile: 'steady', from: 'B', to: 'A', position: 40 - i * 9, speed: 8 });
    const queues = new QueueTracker(controls.length);
    run(s, 25, () => queues.sample(s.queueLengths()));
    expect(queues.live).toEqual([4, 0]);
    run(s, 15, () => queues.sample(s.queueLengths())); // green from 30 s: the queue clears
    expect(queues.live).toEqual([0, 0]);
    expect(queues.peak).toEqual([4, 0]);
  });

  it('averages travel time over finished trips only, with that sample count, and reports the counts as they are', () => {
    const s = new TrafficSimulation(graph, { seed: 2, controls, demand: { tripsPerMinute: 12, entries: { B: 1 } } });
    const queues = new QueueTracker(controls.length);
    run(s, 60, () => queues.sample(s.queueLengths()));
    const results = summariseRun(s, queues, describeApproaches(pieces, graph, controls));
    const { due, entered, finished, blocked } = s.counts;
    expect(results).toMatchObject({ due, entered, finished, blocked, travelTimeSamples: finished });
    expect(finished).toBeGreaterThan(3);
    const expectedAverage = s.travelTimes.reduce((a, b) => a + b, 0) / s.travelTimes.length;
    expect(results.averageTravelTime).toBeCloseTo(expectedAverage, 6);
    // Everyone waited through the red light, so the average is well above the ~10 s free-flow crossing.
    expect(results.averageTravelTime!).toBeGreaterThan(15);
    expect(results.peakQueues).toEqual([
      { approach: 'Crossing 1 · eastbound', peak: queues.peak[0] },
      { approach: 'Crossing 1 · westbound', peak: 0 },
    ]);
    expect(queues.peak[0]).toBeGreaterThan(2);
  });

  it('has no average travel time until a trip finishes', () => {
    const s = new TrafficSimulation(graph, { seed: 3, controls });
    const results = summariseRun(s, new QueueTracker(controls.length), describeApproaches(pieces, graph, controls));
    expect(results.averageTravelTime).toBeNull();
    expect(results.travelTimeSamples).toBe(0);
  });
});
