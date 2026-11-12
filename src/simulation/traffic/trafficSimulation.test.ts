import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import type { PiecePlacement } from '../network/scene';
import { laneSpeedLimits } from '../network/scene';
import { resolveSignals } from './signals';
import { TrafficSimulation } from './trafficSimulation';
import { VEHICLE_TYPES } from './vehicleTypes';
import { PROFILE_RANGES } from './drivers';

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

describe('driving core: safety and fairness (review findings)', () => {
  const pieces: PiecePlacement[] = road.map((p, i) => (i === 8 ? { ...p, piece: 'crossing' } : p));
  const signalGraph = buildLaneGraph(pieces);
  const west = signalGraph.gateways.find((g) => g.at[0] === 0)!.label;
  const east = signalGraph.gateways.find((g) => g.at[0] === 16)!.label;
  const redFirst = resolveSignals(pieces, signalGraph, [{ type: 'signal', piece: 8, port: 'w', timing: { green: 20, amber: 3, red: 20, offset: 23 } }]);

  it('never lets one vehicle overlap another, even closing too fast to stop on a car held at a red light', () => {
    const sim = new TrafficSimulation(signalGraph, { seed: 11, signals: redFirst });
    // The stop line is 70 m from the west edge; the tractor waits right at it.
    const standing = sim.addVehicle({ type: 'tractor', profile: 'steady', from: west, to: east, position: 69, speed: 0 });
    // A heavy truck at 14 m/s, 15 m behind: more than its brakes can absorb.
    const fast = sim.addVehicle({ type: 'heavyTruck', profile: 'assertive', from: west, to: east, position: 50, speed: 14 });
    for (let i = 0; i < 300; i++) {
      sim.step(STEP);
      expect(gapBetween(sim, fast, standing)).toBeGreaterThan(0);
    }
    expect(sim.vehicle(standing).speed).toBe(0);
  });

  it('lets vehicles enter without emergency braking, even at a congested entrance', () => {
    const sim = new TrafficSimulation(signalGraph, { seed: 12, signals: redFirst, demand: { tripsPerMinute: 40, entries: { [west]: 1 } } });
    let hardest = 0;
    run(sim, 60, () => {
      for (const v of sim.allVehicles()) hardest = Math.min(hardest, v.acceleration);
    });
    // Comfortable braking tops out at 3.5 m/s² for the most assertive drivers.
    expect(hardest).toBeGreaterThanOrEqual(-4);
  });

  it('starts queued cars moving strictly one after another on green', () => {
    const sim = new TrafficSimulation(signalGraph, { seed: 13, signals: redFirst });
    const cars = [0, 1, 2, 3].map((i) => sim.addVehicle({ type: i % 2 ? 'van' : 'compact', profile: 'steady', from: west, to: east, position: 40 - i * 10, speed: 10 }));
    const startedAt = new Map<number, number>();
    let t = 0;
    run(sim, 32, () => {
      t += STEP;
      for (const car of cars) if (t > 20 && !startedAt.has(car) && sim.vehicle(car).speed > 0.5) startedAt.set(car, t);
    });
    const times = cars.map((c) => startedAt.get(c)!);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('fits more compact cars than heavy trucks into the same queue space', () => {
    const queueLength = (type: 'compact' | 'heavyTruck') => {
      const sim = new TrafficSimulation(signalGraph, { seed: 14, signals: redFirst });
      // The stop line is 70 m in; start just behind it.
      const ids = [0, 1, 2, 3, 4].map((i) => sim.addVehicle({ type, profile: 'steady', from: west, to: east, position: 66 - i * 13, speed: 4 }));
      run(sim, 18);
      return sim.routeProgress(ids[0]) - (sim.routeProgress(ids[4]) - sim.vehicle(ids[4]).type.length);
    };
    expect(queueLength('compact')).toBeLessThan(queueLength('heavyTruck') - 20);
  });

  it('keeps going once it has decided to go on amber, and says why it stops for amber', () => {
    // Amber starts at t = 20; this car is too close to stop comfortably.
    const amberAt20 = resolveSignals(pieces, signalGraph, [{ type: 'signal', piece: 8, port: 'w', timing: { green: 20, amber: 3, red: 20, offset: 0 } }]);
    const sim = new TrafficSimulation(signalGraph, { seed: 15, signals: amberAt20 });
    run(sim, 19.4);
    const going = sim.addVehicle({ type: 'sedan', profile: 'steady', from: west, to: east, position: 64, speed: 13 });
    let hardest = 0;
    while (sim.has(going) && sim.stopLineDistance(going) !== Infinity) {
      sim.step(STEP);
      hardest = Math.min(hardest, sim.vehicle(going).acceleration);
    }
    expect(hardest).toBeGreaterThan(-3);

    const stopper = new TrafficSimulation(signalGraph, { seed: 16, signals: amberAt20 });
    run(stopper, 20.2);
    const far = stopper.addVehicle({ type: 'sedan', profile: 'steady', from: west, to: east, position: 20, speed: 10 });
    run(stopper, 2); // amber lasts until t = 23
    expect(stopper.vehicle(far).reason).toBe('Amber light');
  });
});

describe('driver profiles', () => {
  it('overlap one another on every preference, so drivers of different profiles can still behave alike', () => {
    const profiles = Object.values(PROFILE_RANGES);
    for (const key of ['speedFactor', 'headway', 'minGap', 'acceleration', 'comfortBraking', 'acceptedGap', 'compliance', 'patience', 'courtesy'] as const) {
      for (const a of profiles)
        for (const b of profiles) {
          const [lo, hi] = [Math.max(a[key][0], b[key][0]), Math.min(a[key][1], b[key][1])];
          expect(hi - lo, `${a.label} vs ${b.label} on ${key}`).toBeGreaterThan(0);
        }
    }
  });
});

describe('driving core: speed limits', () => {
  // Tiles 6–9 are a 30 km/h zone on an otherwise 50 km/h road; tiles 12–15 are 70 km/h.
  const zoned: PiecePlacement[] = road.map((p, i) => (i >= 6 && i <= 9 ? { ...p, speedLimit: 30 } : i >= 12 ? { ...p, speedLimit: 70 } : p));
  const zonedGraph = buildLaneGraph(zoned);

  it('keeps to each stretch’s limit, slowing before a lower one and picking up after it', () => {
    const sim = new TrafficSimulation(zonedGraph, { seed: 3, speedLimits: laneSpeedLimits(zoned, zonedGraph) });
    const car = sim.addVehicle({ type: 'sedan', profile: 'steady', from: westGate.label, to: eastGate.label, speed: 13 });
    const fastest = new Map<string, number>();
    run(sim, 30, () => {
      if (!sim.has(car)) return;
      const v = sim.vehicle(car);
      const tile = zoned[zonedGraph.lanes[v.route[v.routeIndex]].piece].at[0] - 0.5;
      const zone = tile >= 6 && tile <= 9 ? 'slow' : tile >= 13 ? 'fast' : tile < 5 ? 'before' : 'other';
      fastest.set(zone, Math.max(fastest.get(zone) ?? 0, v.speed));
    });
    expect(fastest.get("slow")!).toBeLessThan((30 / 3.6) * 1.15); // at most modest speeding, decided once per stretch
    expect(fastest.get('before')!).toBeGreaterThan(40 / 3.6);
    expect(fastest.get('fast')!).toBeGreaterThan(55 / 3.6);
  });
});

describe('driving core: local trips and timed peaks', () => {
  // A road with a driveway on its south side at tile 8: an access point for local trips.
  const withDriveway: PiecePlacement[] = road.map((p, i) => (i === 8 ? { ...p, piece: 'driveway' } : p));
  const g = buildLaneGraph(withDriveway);

  it('labels driveways so trips can start and end there', () => {
    expect(g.accessPoints.map((a) => a.label)).toEqual(['P1']);
  });

  it('leaves the other trips exactly as they were when a peak is added', () => {
    const demand = { tripsPerMinute: 8, entries: { A: 1, B: 1 }, destinations: { A: 1, B: 1 } };
    const base = new TrafficSimulation(g, { seed: 6, demand });
    const peaked = new TrafficSimulation(g, { seed: 6, demand: { ...demand, peaks: [{ from: 5, to: 40, tripsPerMinute: 30, entries: { A: 1, B: 1 }, destinations: { P1: 1 } }] } });
    run(base, 60);
    run(peaked, 60);
    expect(peaked.arrivals.filter((a) => a.to !== 'P1')).toEqual(base.arrivals);
  });

  it('adds a peak of trips to and from the driveway only during its time window', () => {
    const sim = new TrafficSimulation(g, {
      seed: 4,
      demand: {
        tripsPerMinute: 6,
        entries: { A: 1, B: 1 },
        destinations: { A: 1, B: 1 },
        peaks: [
          { from: 20, to: 50, tripsPerMinute: 20, entries: { A: 1, B: 1 }, destinations: { P1: 1 } },
          { from: 20, to: 50, tripsPerMinute: 10, entries: { P1: 1 }, destinations: { A: 1, B: 1 } },
        ],
      },
    });
    let reachedDriveway = 0;
    run(sim, 90, () => {
      for (const v of sim.allVehicles()) if (v.destination === 'P1' && v.routeIndex === v.route.length - 1) reachedDriveway++;
    });
    const local = sim.arrivals.filter((a) => a.to === 'P1' || a.from === 'P1');
    expect(local.length).toBeGreaterThan(8);
    for (const trip of local) expect(trip.at >= 20 && trip.at <= 50).toBe(true);
    expect(sim.arrivals.filter((a) => a.to !== 'P1' && a.from !== 'P1').length).toBeGreaterThan(5);
    expect(reachedDriveway).toBeGreaterThan(0);
    expect(sim.counts.finished).toBeGreaterThan(local.length * 0.5);
  });
});

describe('driving core: climbing', () => {
  // A road that climbs two ramps (tiles 6–7) onto a bridge (tile 8) and back down (tiles 9–10).
  const climb: PiecePlacement[] = [
    ...road.filter((_, i) => i < 6 || i > 10),
    { piece: 'ramp', at: [6.5, 8.5], rotation: 0 },
    { piece: 'support', at: [7.5, 8.5], rotation: 0 },
    { piece: 'ramp', at: [7.5, 8.5], rotation: 0, level: 0.25 },
    { piece: 'bridge', at: [8.5, 8.5], rotation: 90 },
    { piece: 'support', at: [9.5, 8.5], rotation: 0 },
    { piece: 'ramp', at: [9.5, 8.5], rotation: 180, level: 0.25 },
    { piece: 'ramp', at: [10.5, 8.5], rotation: 180 },
  ];
  const climbGraph = buildLaneGraph(climb);
  const west = climbGraph.gateways.find((gw) => gw.at[0] === 0)!.label;
  const east = climbGraph.gateways.find((gw) => gw.at[0] === 16)!.label;

  it('lets a car pull away up the climb while a heavy truck barely can', () => {
    const speedGained = (type: 'sedan' | 'heavyTruck', pieces = climb, g = climbGraph) => {
      const sim = new TrafficSimulation(g, { seed: 2 });
      // Both reach the foot of the climb at 8 m/s, below what they'd like to do.
      const v = sim.addVehicle({ type, profile: 'steady', from: west, to: east, position: 50, speed: 8 });
      let atFoot = 0;
      let atTop = 0;
      run(sim, 15, () => {
        if (!sim.has(v)) return;
        const tile = pieces[g.lanes[sim.vehicle(v).route[sim.vehicle(v).routeIndex]].piece].at[0] - 0.5;
        if (tile === 5) atFoot = sim.vehicle(v).speed;
        if (tile === 8 && atTop === 0) atTop = sim.vehicle(v).speed;
      });
      return atTop - atFoot;
    };
    const truck = speedGained('heavyTruck');
    const car = speedGained('sedan');
    // Two tiles of 5 % climb (g × 0.05 ≈ 0.5 m/s² lost): a car has power to spare, a heavy truck hardly any.
    expect(car).toBeGreaterThan(truck + 1);
    // The same truck over the same stretch of flat road picks up clearly more speed.
    expect(speedGained('heavyTruck', road, graph)).toBeGreaterThan(truck + 0.5);
  });

  it('lets a heavy truck with a cautious driver restart from a stop on the ramp', () => {
    const sim = new TrafficSimulation(climbGraph, { seed: 2 });
    // Stopped half-way up the first ramp (tile 6 starts 52.5 m in).
    const truck = sim.addVehicle({ type: 'heavyTruck', profile: 'cautious', from: west, to: east, position: 57, speed: 0 });
    run(sim, 8);
    expect(sim.vehicle(truck).speed).toBeGreaterThan(1.5);
  });

  it('holds its speed going down the ramp rather than running past the limit', () => {
    const sim = new TrafficSimulation(climbGraph, { seed: 2 });
    const car = sim.addVehicle({ type: 'sedan', profile: 'steady', from: west, to: east, position: 75, speed: 10 });
    const limit = sim.vehicle(car).preferredSpeed;
    let fastest = 0;
    run(sim, 6, () => {
      if (sim.has(car)) fastest = Math.max(fastest, sim.vehicle(car).speed);
    });
    expect(fastest).toBeLessThanOrEqual(limit + 1e-6);
  });
});
