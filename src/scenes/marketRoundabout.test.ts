import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { TRIPS_PER_MINUTE } from '../simulation/traffic/intensity';
import { aspectAt, resolveControls } from '../simulation/traffic/signals';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { marketRoundabout } from './marketRoundabout';

const STEP = 1 / 30;
const graph = buildLaneGraph(marketRoundabout.pieces);
const controls = resolveControls(marketRoundabout.pieces, graph, marketRoundabout.controls);
const ROUNDABOUT = 0;
const [NORTH, EAST, SOUTH, WEST] = ['A', 'B', 'C', 'D'];
/** Lanes that run round the ring (they continue within the roundabout piece). */
const ringLanes = new Set(graph.lanes.filter((l) => l.piece === ROUNDABOUT && l.previous.some((p) => graph.lanes[p].piece === ROUNDABOUT)).map((l) => l.id));

function simulate(intensity: keyof typeof TRIPS_PER_MINUTE, seed: number) {
  return new TrafficSimulation(graph, { seed, controls, demand: { tripsPerMinute: TRIPS_PER_MINUTE[intensity], entries: marketRoundabout.demand.gateways } });
}

describe('Market Roundabout preset', () => {
  it('is a valid scene that fits the board, with four arms and an open connection past the crossing', () => {
    expect(validateScene(marketRoundabout)).toEqual([]);
    expect(graph.mismatches).toEqual([]);
    expect(graph.gateways.map((g) => g.label)).toEqual([NORTH, EAST, SOUTH, WEST]);
    expect(graph.openEnds).toEqual([{ at: [13.5, 7], level: 0, facing: [0, -1] }]);
    const used = new Set(marketRoundabout.pieces.flatMap((p) => (p.piece === 'roundabout' ? [] : [`${Math.floor(p.at[0])},${Math.floor(p.at[1])}`])));
    expect((used.size + 9) / (BOARD_TILES * BOARD_TILES)).toBeLessThan(0.3);
  });

  it('works as soon as it opens: traffic flows at Medium and nobody is stuck for long', () => {
    for (const seed of [1, 2, 3]) {
      const s = simulate('medium', seed);
      const stoppedSince = new Map<number, number>();
      let longestStop = 0;
      for (let i = 0; i < 180 * 30; i++) {
        s.step(STEP);
        for (const v of s.allVehicles()) {
          if (v.speed > 0.1) stoppedSince.delete(v.id);
          else if (!stoppedSince.has(v.id)) stoppedSince.set(v.id, s.time);
          else longestStop = Math.max(longestStop, s.time - stoppedSince.get(v.id)!);
        }
      }
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.85);
      expect(finished).toBeGreaterThan(due * 0.6);
      expect(longestStop).toBeLessThan(90);
    }
  });

  it('takes its uneven demand from the scene: most trips from the west, then the north, east and south', () => {
    const s = simulate('medium', 4);
    for (let i = 0; i < 300 * 30; i++) s.step(STEP);
    const from = (label: string) => s.arrivals.filter((a) => a.from === label).length;
    expect(from(WEST)).toBeGreaterThan(from(NORTH));
    expect(from(NORTH)).toBeGreaterThan(from(EAST));
    expect(from(EAST) + from(SOUTH)).toBeLessThan(from(WEST));
  });

  it('lets the crossing’s queue spill back into the circle when traffic is heavy', () => {
    let stoppedOnRing = 0;
    for (const seed of [1, 2]) {
      const s = simulate('congested', seed);
      for (let i = 0; i < 180 * 30; i++) {
        s.step(STEP);
        if (aspectAt(marketRoundabout.controls[0].timing!, s.time) === 'green') continue;
        for (const v of s.allVehicles()) if (ringLanes.has(v.route[v.routeIndex]) && v.speed < 0.5) stoppedOnRing++;
      }
    }
    expect(stoppedOnRing).toBeGreaterThan(30 * 5); // vehicle-seconds × 30 steps
  });

  it('lets a driver who accepts small gaps take an opening that another driver waits out', () => {
    const outcome = (acceptedGap: number) => {
      const s = new TrafficSimulation(graph, { seed: 9, controls });
      // About to enter from the north arm; anticlockwise, it passes the west entry first, then leaves south.
      s.addVehicle({ type: 'sedan', profile: 'steady', from: NORTH, to: SOUTH, position: 47, speed: 5 });
      // Waiting at the west entry's line (the west arm is 6 tiles, 52.5 m).
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
    // The bold driver pulls out in front of the circulating car; the careful one lets it pass first.
    expect(bold.enteredAt).toBeLessThan(careful.enteredAt - 2);
    expect(careful.waited).toBeGreaterThan(bold.waited + 2);
  });
});
