import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import type { PiecePlacement } from '../network/scene';
import { resolveSignals } from './signals';
import { TrafficSimulation } from './trafficSimulation';
import { VEHICLE_TYPES } from './vehicleTypes';

const STEP = 1 / 30;
/** A straight road across the whole board, west to east. */
const road: PiecePlacement[] = Array.from({ length: 16 }, (_, i) => ({ piece: 'straight', at: [i + 0.5, 8.5], rotation: 0 }));
const graph = buildLaneGraph(road);
const westGate = graph.gateways.find((g) => g.at[0] === 0)!;
const eastGate = graph.gateways.find((g) => g.at[0] === 16)!;

function run(sim: TrafficSimulation, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    sim.step(STEP);
    each?.();
  }
}

describe('driving core: a single car', () => {
  it('pulls away smoothly and settles at its preferred speed without overshooting', () => {
    const sim = new TrafficSimulation(graph, { seed: 1 });
    const car = sim.addVehicle({ type: 'sedan', profile: 'steady', from: westGate.label, to: eastGate.label });
    const preferred = sim.vehicle(car).preferredSpeed;
    let previous = 0;
    let largestChange = 0;
    let fastest = 0;

    // Until it drives off the east edge of the board.
    while (sim.has(car)) {
      sim.step(STEP);
      if (!sim.has(car)) break;
      const { speed } = sim.vehicle(car);
      largestChange = Math.max(largestChange, Math.abs(speed - previous));
      fastest = Math.max(fastest, speed);
      previous = speed;
      expect(speed).toBeLessThanOrEqual(preferred + 1e-6);
    }

    expect(fastest).toBeGreaterThan(preferred * 0.9);
    // Smooth: no step changes speed by more than a sedan can accelerate in 1/30 s.
    expect(largestChange).toBeLessThanOrEqual(VEHICLE_TYPES.sedan.maxAcceleration * STEP + 1e-9);
  });
});

/** Distance from a vehicle's front bumper to the leader's rear bumper, along the shared route. */
function gapBetween(sim: TrafficSimulation, follower: number, leader: number) {
  return sim.distanceAlongRoute(follower, leader) - sim.vehicle(leader).type.length;
}

describe('driving core: following', () => {
  it('slows to the speed of a slower vehicle ahead and never gets closer than its minimum gap', () => {
    const sim = new TrafficSimulation(graph, { seed: 2 });
    // A tractor tops out at 8.3 m/s, so it holds a steady slow speed.
    const leader = sim.addVehicle({ type: 'tractor', profile: 'cautious', from: westGate.label, to: eastGate.label, position: 30, speed: 8 });
    const follower = sim.addVehicle({ type: 'compact', profile: 'assertive', from: westGate.label, to: eastGate.label, position: 5, speed: 12 });
    const minGap = sim.vehicle(follower).driver.minGap;
    let closest = Infinity;

    // 8 s: long enough to settle behind the leader, short enough for both to stay on the 140 m road.
    run(sim, 8, () => (closest = Math.min(closest, gapBetween(sim, follower, leader))));

    expect(closest).toBeGreaterThanOrEqual(minGap);
    expect(Math.abs(sim.vehicle(follower).speed - sim.vehicle(leader).speed)).toBeLessThan(0.5);
    expect(sim.vehicle(follower).reason).toBe('Following the car ahead');
  });
});

describe('driving core: one lane, one traffic light', () => {
  // A road with a signal-controlled pedestrian crossing in the middle, on the eastbound approach.
  const pieces: PiecePlacement[] = road.map((p, i) => (i === 8 ? { ...p, piece: 'crossing' } : p));
  const signalGraph = buildLaneGraph(pieces);
  // Red for the first 20 s, then green.
  const timing = { green: 20, amber: 3, red: 20, offset: 23 };
  const controls = resolveSignals(pieces, signalGraph, [{ type: 'signal', piece: 8, port: 'w', timing }]);

  function queueAtRed() {
    const sim = new TrafficSimulation(signalGraph, { seed: 3, signals: controls });
    const cars = [0, 1, 2, 3].map((i) =>
      // Gateways are labelled clockwise from the north-west corner: B is the west end, A the east end.
      sim.addVehicle({ type: 'sedan', profile: 'steady', from: 'B', to: 'A', position: 40 - i * 9, speed: 10 }),
    );
    return { sim, cars };
  }

  it('queues behind the stop line at red, the first car for the light and the rest behind it', () => {
    const { sim, cars } = queueAtRed();
    run(sim, 18);

    const stopLine = sim.stopLineDistance(cars[0]);
    expect(stopLine).toBeGreaterThan(0);
    expect(stopLine).toBeLessThan(3);
    for (const car of cars) expect(sim.vehicle(car).speed).toBeLessThan(0.1);
    expect(sim.vehicle(cars[0]).reason).toBe('Red light');
    for (const car of cars.slice(1)) expect(sim.vehicle(car).reason).toBe('Queued behind the car ahead');
    // Stopped cars keep their preferred minimum gap (within 5 cm of step-size slack) and never touch.
    for (let i = 1; i < cars.length; i++) {
      const gap = sim.distanceAlongRoute(cars[i], cars[i - 1]) - sim.vehicle(cars[i - 1]).type.length;
      expect(gap).toBeGreaterThanOrEqual(sim.vehicle(cars[i]).driver.minGap - 0.05);
    }
  });

  it('pulls away one by one on green, in queue order', () => {
    const { sim, cars } = queueAtRed();
    const crossedAt = new Map<number, number>();
    let t = 0;
    run(sim, 40, () => {
      t += STEP;
      for (const car of cars) if (!crossedAt.has(car) && sim.stopLineDistance(car) === Infinity) crossedAt.set(car, t);
    });

    const times = cars.map((c) => crossedAt.get(c)!);
    expect(times.every((time) => time > 20)).toBe(true); // nobody crosses on red
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(0.8);
  });
});

describe('driving core: drivers and vehicles', () => {
  function secondsToReach(type: 'compact' | 'heavyTruck', profile: 'steady' | 'assertive' | 'cautious', speed: number, seed = 4) {
    const sim = new TrafficSimulation(graph, { seed });
    const id = sim.addVehicle({ type, profile, from: westGate.label, to: eastGate.label });
    let t = 0;
    let strongest = 0;
    while (sim.vehicle(id).speed < speed && t < 60) {
      sim.step(STEP);
      t += STEP;
      strongest = Math.max(strongest, sim.vehicle(id).acceleration);
    }
    return { t, strongest };
  }

  it('pulls away faster in a compact car than in a heavy truck, which also takes more road', () => {
    expect(secondsToReach('compact', 'steady', 8).t).toBeLessThan(secondsToReach('heavyTruck', 'steady', 8).t);
    expect(VEHICLE_TYPES.compact.length).toBeLessThan(VEHICLE_TYPES.heavyTruck.length);
  });

  it('keeps an assertive truck driver within what a truck can do', () => {
    const assertiveTruck = secondsToReach('heavyTruck', 'assertive', 8);
    expect(assertiveTruck.strongest).toBeLessThanOrEqual(VEHICLE_TYPES.heavyTruck.maxAcceleration + 1e-9);
    // Even a cautious driver in a compact car out-accelerates an assertive truck driver.
    expect(secondsToReach('compact', 'cautious', 8).t).toBeLessThan(assertiveTruck.t);
  });

  it('gives two drivers with the same profile different preferences, kept for the whole trip', () => {
    const sim = new TrafficSimulation(graph, { seed: 5 });
    const a = sim.addVehicle({ type: 'sedan', profile: 'steady', from: westGate.label, to: eastGate.label });
    const b = sim.addVehicle({ type: 'sedan', profile: 'steady', from: westGate.label, to: eastGate.label, position: 60 });
    const before = { ...sim.vehicle(a).driver };

    expect(sim.vehicle(a).driver.headway).not.toBeCloseTo(sim.vehicle(b).driver.headway, 3);
    expect(sim.vehicle(a).driver.speedFactor).not.toBeCloseTo(sim.vehicle(b).driver.speedFactor, 3);
    run(sim, 10);
    expect(sim.vehicle(a).driver).toEqual(before);
  });
});

describe('driving core: demand', () => {
  const westOnly = { tripsPerMinute: 10, entries: { [westGate.label]: 1 } };

  function snapshot(sim: TrafficSimulation) {
    return sim.allVehicles().map((v) => [v.id, v.type.id, v.driver.profile, v.driver.headway.toFixed(6), v.position.toFixed(6)].join(':'));
  }

  it('repeats the same arrivals, drivers and vehicles for the same seed, and changes them for another', () => {
    const make = (seed: number) => {
      const sim = new TrafficSimulation(graph, { seed, demand: westOnly });
      const trace: string[][] = [];
      // Sample every 5 s: the board can be empty at any single moment.
      for (let i = 0; i < 18; i++) {
        run(sim, 5);
        trace.push(snapshot(sim));
      }
      return { trips: sim.counts, state: trace, travelTimes: sim.travelTimes.map((t) => t.toFixed(6)) };
    };
    const first = make(7);
    expect(make(7)).toEqual(first);
    expect(make(8).state).not.toEqual(first.state);
  });

  it('brings trips due at the chosen rate per minute and counts them as they enter and finish', () => {
    const sim = new TrafficSimulation(graph, { seed: 9, demand: westOnly });
    run(sim, 600);

    expect(sim.counts.due).toBeGreaterThanOrEqual(80);
    expect(sim.counts.due).toBeLessThanOrEqual(120);
    expect(sim.counts.entered).toBe(sim.counts.due - sim.counts.waiting);
    expect(sim.counts.finished).toBeGreaterThan(sim.counts.entered * 0.8);
    expect(sim.counts.finished).toBe(sim.counts.entered - sim.allVehicles().length);
  });

  it('keeps trips waiting outside when the entrance is full, without overlapping vehicles', () => {
    // A light right by the west entrance that stays red: the queue fills back to the board edge.
    const pieces: PiecePlacement[] = road.map((p, i) => (i === 2 ? { ...p, piece: 'crossing' } : p));
    const g = buildLaneGraph(pieces);
    const signals = resolveSignals(pieces, g, [{ type: 'signal', piece: 2, port: 'w', timing: { green: 1, amber: 1, red: 10000, offset: 2 } }]);
    const sim = new TrafficSimulation(g, { seed: 10, signals, demand: { tripsPerMinute: 30, entries: { [g.gateways.find((x) => x.at[0] === 0)!.label]: 1 } } });
    run(sim, 120);

    expect(sim.counts.waiting).toBeGreaterThan(0);
    expect(sim.counts.entered).toBeLessThan(sim.counts.due);
    const queue = sim.allVehicles().sort((a, b) => sim.routeProgress(b.id) - sim.routeProgress(a.id));
    for (let i = 1; i < queue.length; i++) expect(sim.distanceAlongRoute(queue[i].id, queue[i - 1].id) - queue[i - 1].type.length).toBeGreaterThan(0);
  });
});
