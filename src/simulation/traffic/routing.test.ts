import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import type { ControlPlacement, PiecePlacement } from '../network/scene';
import { resolveControls } from './signals';
import { type Demand, TrafficSimulation } from './trafficSimulation';

const STEP = 1 / 30;

/**
 * A main road west–east along z = 8.5 with T-junctions at x = 3.5 and x = 12.5. A longer
 * bypass leaves the first junction southwards, runs east along z = 12.5 and rejoins at the
 * second. A pedestrian crossing at x = 8.5 sits on the main road between the junctions.
 * Gateways (clockwise from the north-west): A east, B west.
 */
const FIRST_T = 3;
const CROSSING = 8;
const MAIN_LINK = 7; // a straight between the first junction and the crossing
const pieces: PiecePlacement[] = [
  ...Array.from({ length: 16 }, (_, i): PiecePlacement => ({ piece: i === FIRST_T || i === 12 ? 't-junction' : i === CROSSING ? 'crossing' : 'straight', at: [i + 0.5, 8.5], rotation: 0 })),
  ...[9, 10, 11].flatMap((z): PiecePlacement[] => [
    { piece: 'straight', at: [3.5, z + 0.5], rotation: 90 },
    { piece: 'straight', at: [12.5, z + 0.5], rotation: 90 },
  ]),
  { piece: 'bend', at: [3.5, 12.5], rotation: 180 },
  ...[4, 5, 6, 7, 8, 9, 10, 11].map((x): PiecePlacement => ({ piece: 'straight', at: [x + 0.5, 12.5], rotation: 0 })),
  { piece: 'bend', at: [12.5, 12.5], rotation: 270 },
];
const graph = buildLaneGraph(pieces);
const [EAST, WEST] = ['A', 'B'];
const BYPASS = new Set(pieces.map((p, i) => (p.at[1] > 9 ? i : -1)).filter((i) => i >= 0));
const lanesOf = (piece: number) => graph.lanes.filter((l) => l.piece === piece).map((l) => l.id);

function sim(options: { seed?: number; controls?: ControlPlacement[]; demand?: Demand } = {}) {
  return new TrafficSimulation(graph, { seed: options.seed ?? 1, controls: resolveControls(pieces, graph, options.controls ?? []), demand: options.demand });
}
function run(s: TrafficSimulation, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s.step(STEP);
    each?.();
  }
}
/** Run until `done` holds (at most `seconds`). */
function runUntil(s: TrafficSimulation, done: () => boolean, seconds = 60) {
  for (let i = 0; i < Math.round(seconds / STEP) && !done(); i++) s.step(STEP);
  expect(done()).toBe(true);
}
const usesBypass = (s: TrafficSimulation, id: number) => s.vehicle(id).route.some((lane) => BYPASS.has(graph.lanes[lane].piece));

describe('routing: destinations and routes', () => {
  it('gives each trip a destination and a connected route over the lane graph that ends at it', () => {
    const s = sim({ demand: { tripsPerMinute: 30, entries: { [WEST]: 1, [EAST]: 1 } } });
    const seen = new Set<number>();
    run(s, 40, () => {
      for (const v of s.allVehicles()) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const exit = graph.gateways.find((g) => g.label === v.destination)!;
        expect(exit).toBeDefined();
        expect(exit.exitLanes).toContain(v.route[v.route.length - 1]);
        for (let i = 1; i < v.route.length; i++) expect(graph.lanes[v.route[i - 1]].next).toContain(v.route[i]);
      }
    });
    expect(seen.size).toBeGreaterThan(10);
  });

  it('takes the shorter main road when traffic is light', () => {
    const s = sim();
    const car = s.addVehicle({ type: 'sedan', profile: 'steady', from: WEST, to: EAST });
    expect(s.vehicle(car).destination).toBe(EAST);
    expect(usesBypass(s, car)).toBe(false);
  });
});

// The crossing's light, red for the first 30 s: the main road backs up towards the first junction.
const LONG_RED: ControlPlacement = { type: 'signal', piece: CROSSING, port: 'w', timing: { green: 30, amber: 3, red: 30, offset: 33 } };

describe('routing: choosing between alternatives', () => {
  it('sends some drivers round the bypass once the main road backs up, but not everyone', () => {
    const tally = (controls: ControlPlacement[]) => {
      const bypass = new Set<string>();
      const main = new Set<string>();
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const s = sim({ seed, controls, demand: { tripsPerMinute: 24, entries: { [WEST]: 1 }, destinations: { [EAST]: 1 } } });
        run(s, 40, () => {
          for (const v of s.allVehicles()) (usesBypass(s, v.id) ? bypass : main).add(`${seed}:${v.id}`);
        });
      }
      return { bypass: bypass.size, main: main.size };
    };
    const free = tally([]);
    expect(free.bypass).toBe(0);
    const backedUp = tally([LONG_RED]);
    expect(backedUp.bypass).toBeGreaterThan(2);
    expect(backedUp.main).toBeGreaterThan(backedUp.bypass);
  });
});

describe('routing: impatient rerouting', () => {
  /** A car held at the first junction by a queue back from the red light; has it switched to the bypass after `seconds`? */
  const reroutes = (profile: 'impatient' | 'cautious', seed: number, seconds: number) => {
    const s = sim({ seed, controls: [LONG_RED] });
    for (let i = 0; i < 6; i++) s.addVehicle({ type: 'sedan', profile: 'steady', from: WEST, to: EAST, position: 69.5 - i * 6.5, speed: 0 });
    const car = s.addVehicle({ type: 'sedan', profile, from: WEST, to: EAST, position: 5, speed: 8 });
    expect(usesBypass(s, car)).toBe(false);
    run(s, seconds);
    return usesBypass(s, car);
  };

  it('makes impatient drivers more likely than cautious ones to try another route after a long wait', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const impatient = seeds.filter((seed) => reroutes('impatient', seed, 10)).length;
    const cautious = seeds.filter((seed) => reroutes('cautious', seed, 10)).length;
    expect(impatient).toBeGreaterThan(cautious + 5);
    expect(cautious).toBeLessThan(seeds.length);
  });

  it('lets that willingness build while held up and settle back once moving', () => {
    const s = sim({ seed: 3, controls: [LONG_RED] });
    // Past the first junction, so it can only wait out the red light.
    const car = s.addVehicle({ type: 'sedan', profile: 'impatient', from: WEST, to: EAST, position: 45, speed: 8 });
    const calm = s.routeSensitivity(car);
    run(s, 28);
    const frustrated = s.routeSensitivity(car);
    expect(frustrated).toBeGreaterThan(calm * 1.5);
    // Green from 30 s: by the time it leaves the board it has calmed down noticeably.
    let lastSeen = frustrated;
    let moving = 0;
    run(s, 20, () => {
      if (!s.has(car)) return;
      if (s.vehicle(car).speed > 5) moving += STEP;
      lastSeen = s.routeSensitivity(car);
    });
    expect(moving).toBeGreaterThan(4);
    expect(lastSeen).toBeLessThan(frustrated * 0.9);
  });
});

describe('routing: closed connections', () => {
  const pieceOf = (s: TrafficSimulation, id: number) => {
    const v = s.vehicle(id);
    return graph.lanes[v.route[v.routeIndex]].piece;
  };
  const AFTER_JUNCTION = FIRST_T + 1;
  const BYPASS_START = pieces.findIndex((p) => p.at[0] === 3.5 && p.at[1] === 9.5);

  it('lets vehicles already committed to a closed connection clear it, and reroutes the rest', () => {
    const s = sim({ seed: 2, demand: { tripsPerMinute: 30, entries: { [WEST]: 1 }, destinations: { [EAST]: 1 } } });
    runUntil(s, () => s.time > 20 && s.allVehicles().some((v) => pieceOf(s, v.id) === AFTER_JUNCTION) && s.allVehicles().some((v) => s.routeProgress(v.id) < 8));
    // Close the main road just past the first junction, with traffic on it and heading for it.
    const onIt = s.allVehicles().filter((v) => pieceOf(s, v.id) === AFTER_JUNCTION).map((v) => v.id);
    const farBack = s.allVehicles().filter((v) => s.routeProgress(v.id) < 8).map((v) => v.id);
    const near = s.allVehicles().filter((v) => !onIt.includes(v.id) && !farBack.includes(v.id) && pieceOf(s, v.id) <= FIRST_T).map((v) => v.id);
    expect(onIt.length).toBeGreaterThan(0);
    expect(farBack.length).toBeGreaterThan(0);
    s.setClosed(lanesOf(AFTER_JUNCTION));
    for (const id of farBack) expect(usesBypass(s, id)).toBe(true);
    const enteredClosed = new Set<number>();
    run(s, 40, () => {
      for (const v of s.allVehicles()) if (pieceOf(s, v.id) === AFTER_JUNCTION) enteredClosed.add(v.id);
    });
    // Only vehicles already on it, or too close to stop or turn off, used the closed road.
    for (const id of enteredClosed) expect([...onIt, ...near]).toContain(id);
    for (const id of [...onIt, ...near, ...farBack]) expect(s.has(id)).toBe(false); // all reached the east exit
    expect(s.counts.blocked).toBe(0);
  });

  it('counts and shows trips with no way through as blocked, and lets them go once it reopens', () => {
    const s = sim({ seed: 2, demand: { tripsPerMinute: 30, entries: { [WEST]: 1 }, destinations: { [EAST]: 1 } } });
    runUntil(s, () => s.time > 20 && s.allVehicles().some((v) => pieceOf(s, v.id) === AFTER_JUNCTION) && s.allVehicles().some((v) => pieceOf(s, v.id) < FIRST_T - 1));
    // Between the junction and the closure, with room to stop.
    const caught = s.allVehicles().filter((v) => pieceOf(s, v.id) === AFTER_JUNCTION).map((v) => v.id);
    expect(caught.length).toBeGreaterThan(0);
    const farBack = s.allVehicles().filter((v) => pieceOf(s, v.id) < FIRST_T - 1).map((v) => v.id);
    s.setClosed([...lanesOf(MAIN_LINK), ...lanesOf(BYPASS_START)]); // the main road and the bypass
    run(s, 20);
    for (const id of caught) {
      expect(s.has(id)).toBe(true);
      expect(s.vehicle(id).reason).toBe('Road closed ahead');
      expect(pieceOf(s, id)).toBeLessThan(MAIN_LINK);
    }
    // Those further back wait short of the junction rather than driving into the dead end.
    expect(farBack.length).toBeGreaterThan(0);
    for (const id of farBack) {
      expect(s.has(id)).toBe(true);
      expect(pieceOf(s, id)).toBeLessThan(FIRST_T);
    }
    expect(s.counts.blocked).toBeGreaterThanOrEqual(caught.length + farBack.length);
    expect(s.blockedAtEntries()[WEST]).toBeGreaterThan(0); // arrivals with no way through
    s.setClosed([]);
    run(s, 30);
    for (const id of [...caught, ...farBack]) expect(s.has(id)).toBe(false);
  });
});
