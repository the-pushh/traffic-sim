import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { aspectAt, resolveControls } from '../simulation/traffic/signals';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { marketRoundabout } from './marketRoundabout';
import { runScene, simulateScene, STEP } from './sceneTesting';

const graph = buildLaneGraph(marketRoundabout.pieces);
const controls = resolveControls(marketRoundabout.pieces, graph, marketRoundabout.controls);
const ROUNDABOUT = marketRoundabout.pieces.findIndex((p) => p.piece === 'roundabout');
const ROUNDABOUT_TILES = 9; // 3 × 3
const CROSSING_TIMING = marketRoundabout.controls.find((c) => c.type === 'signal')!.timing!;
// Gateways are labelled clockwise from the north-west corner.
const [NORTH, EAST, SOUTH, WEST] = ['A', 'B', 'C', 'D'];
/** Lanes that run round the ring (they continue within the roundabout piece). */
const ringLanes = new Set(graph.lanes.filter((l) => l.piece === ROUNDABOUT && l.previous.some((p) => graph.lanes[p].piece === ROUNDABOUT)).map((l) => l.id));
/** Steps × vehicles: 30 steps a second, so 150 is five vehicle-seconds. */
const VEHICLE_SECONDS = 30;

/** Vehicle-steps spent stopped on the ring while the crossing's light isn't green. */
function stoppedOnRingForCrossing(s: TrafficSimulation, seconds: number) {
  let count = 0;
  runScene(s, seconds, () => {
    if (aspectAt(CROSSING_TIMING, s.time) === 'green') return;
    for (const v of s.allVehicles()) if (ringLanes.has(v.route[v.routeIndex]) && v.speed < 0.5) count++;
  });
  return count;
}

/** Scene runs simulate minutes of traffic: allow longer than Vitest's default. */
const SLOW_TEST = 30_000;

describe('Market Roundabout preset', () => {
  it('is a valid scene that fits the board, with four arms and an open connection past the crossing', () => {
    expect(validateScene(marketRoundabout)).toEqual([]);
    expect(graph.mismatches).toEqual([]);
    expect(graph.gateways.map((g) => g.label)).toEqual([NORTH, EAST, SOUTH, WEST]);
    expect(graph.openEnds).toEqual([{ at: [13.5, 7], level: 0, facing: [0, -1] }]);
    const used = new Set(marketRoundabout.pieces.flatMap((p) => (p.piece === 'roundabout' ? [] : [`${Math.floor(p.at[0])},${Math.floor(p.at[1])}`])));
    expect((used.size + ROUNDABOUT_TILES) / (BOARD_TILES * BOARD_TILES)).toBeLessThan(0.3);
  });

  it('works as soon as it opens: traffic flows at Medium and nobody is stuck for long', () => {
    for (const seed of [1, 2, 3]) {
      const s = simulateScene(marketRoundabout, 'medium', seed);
      const longestStop = runScene(s, 180);
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.85);
      expect(finished).toBeGreaterThan(due * 0.6);
      expect(longestStop).toBeLessThan(90);
    }
  }, SLOW_TEST);

  it('takes its uneven demand from the scene: most trips from the west, then the north, east and south', () => {
    for (const seed of [4, 5]) {
      const s = simulateScene(marketRoundabout, 'medium', seed);
      runScene(s, 300);
      const from = (label: string) => s.arrivals.filter((a) => a.from === label).length;
      expect(from(WEST)).toBeGreaterThan(from(NORTH));
      expect(from(NORTH)).toBeGreaterThan(from(EAST));
      expect(from(EAST) + from(SOUTH)).toBeLessThan(from(WEST));
    }
  }, SLOW_TEST);

  it('lets the crossing’s queue spill back into the circle when traffic is heavy, but not at Medium', () => {
    const heavy = [1, 2].reduce((n, seed) => n + stoppedOnRingForCrossing(simulateScene(marketRoundabout, 'congested', seed), 180), 0);
    // The same traffic with no light at the crossing: nothing backs into the ring, so the stops are the light's doing.
    const noLight = [1, 2].reduce((n, seed) => n + stoppedOnRingForCrossing(simulateScene(marketRoundabout, 'congested', seed, []), 180), 0);
    const medium = [1, 2].reduce((n, seed) => n + stoppedOnRingForCrossing(simulateScene(marketRoundabout, 'medium', seed), 180), 0);
    // Some stops on the ring happen anyway (drivers merging); the light's queue more than doubles them.
    expect(heavy).toBeGreaterThan(5 * VEHICLE_SECONDS);
    expect(heavy).toBeGreaterThan(noLight * 2);
    expect(heavy).toBeGreaterThan(medium * 3);
  }, SLOW_TEST);

  it('lets a driver who accepts small gaps take an opening that another driver waits out', () => {
    const outcome = (acceptedGap: number) => {
      const s = new TrafficSimulation(graph, { seed: 9, controls });
      // About to enter from the north arm (6 tiles, 52.5 m); anticlockwise, it passes the west entry first.
      s.addVehicle({ type: 'sedan', profile: 'steady', from: NORTH, to: SOUTH, position: 47, speed: 5 });
      // Waiting at the west entry's line (the west arm is also 52.5 m).
      const entering = s.addVehicle({ type: 'sedan', profile: 'steady', from: WEST, to: EAST, position: 52, speed: 0 });
      s.vehicle(entering).driver.acceptedGap = acceptedGap;
      s.vehicle(entering).driver.patience = 1e6; // no frustration in this short wait
      let waited = 0;
      let enteredAt = Infinity;
      for (let i = 0; i < 12 * 30 && enteredAt === Infinity; i++) {
        s.step(STEP);
        const v = s.vehicle(entering);
        if (v.reason === 'Waiting for a gap') waited += STEP;
        if (graph.lanes[v.route[v.routeIndex]].piece === ROUNDABOUT) enteredAt = s.time;
      }
      return { enteredAt, waited };
    };
    const bold = outcome(2.5);
    const careful = outcome(7);
    // The bold driver pulls out in front of the circulating car; the careful one shows
    // "Waiting for a gap" and lets it pass first.
    expect(bold.enteredAt).toBeLessThan(careful.enteredAt - 2);
    expect(careful.waited).toBeGreaterThan(bold.waited + 2);
  });
});
