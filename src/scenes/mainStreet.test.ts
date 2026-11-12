import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { resolveControls } from '../simulation/traffic/signals';
import { TRIPS_PER_MINUTE } from '../simulation/traffic/intensity';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { mainStreet } from './mainStreet';

const STEP = 1 / 30;
const graph = buildLaneGraph(mainStreet.pieces);
const controls = resolveControls(mainStreet.pieces, graph, mainStreet.controls);

function simulate(intensity: keyof typeof TRIPS_PER_MINUTE, seed: number) {
  return new TrafficSimulation(graph, { seed, controls, demand: { tripsPerMinute: TRIPS_PER_MINUTE[intensity], entries: mainStreet.demand.gateways, destinations: mainStreet.demand.destinations } });
}
const xOf = (s: TrafficSimulation, id: number) => {
  const v = s.vehicle(id);
  return mainStreet.pieces[graph.lanes[v.route[v.routeIndex]].piece].at;
};

describe('Main Street preset', () => {
  it('is a valid scene that fits the board, with arterial and side-street entries and an open connection', () => {
    expect(validateScene(mainStreet)).toEqual([]);
    expect(graph.mismatches).toEqual([]);
    // Arterial ends east (D in, E out) and west (H in, I out); side streets north (A–C) and south (F, G).
    expect(graph.gateways.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(graph.openEnds).toEqual([{ at: [11.5, 9], level: 0, facing: [0, 1] }]);
    expect(mainStreet.controls.filter((c) => c.type === 'signal')).toHaveLength(11);
  });

  it('leaves most of the board free for the player to build on', () => {
    const used = new Set(mainStreet.pieces.map((p) => `${Math.floor(p.at[0])},${Math.floor(p.at[1])}`));
    expect(used.size / (BOARD_TILES * BOARD_TILES)).toBeLessThan(0.4);
  });

  it('works as soon as it opens: traffic flows at Medium and nobody is stuck for long', () => {
    for (const seed of [1, 2, 3]) {
      const s = simulate('medium', seed);
      const stoppedSince = new Map<number, number>();
      let longestStop = 0;
      for (let i = 0; i < 240 * 30; i++) {
        s.step(STEP);
        for (const v of s.allVehicles()) {
          if (v.speed > 0.1) stoppedSince.delete(v.id);
          else if (!stoppedSince.has(v.id)) stoppedSince.set(v.id, s.time);
          else longestStop = Math.max(longestStop, s.time - stoppedSince.get(v.id)!);
        }
      }
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.8);
      expect(finished).toBeGreaterThan(due * 0.5);
      // Side-street turners into the short block can miss a green or two, but nobody is stuck.
      expect(longestStop).toBeLessThan(150);
    }
  });

  it('sometimes lets an eastbound group through all three lights without stopping', () => {
    const s = simulate('medium', 3);
    const stopped = new Set<number>();
    const passedAll: number[] = [];
    const seen = new Map<number, number>(); // vehicle → time it crossed the first junction
    for (let i = 0; i < 240 * 30; i++) {
      s.step(STEP);
      for (const v of s.allVehicles()) {
        const [x, z] = xOf(s, v.id);
        if (z !== 8.5) continue; // eastbound carriageway only
        if (x > 3.5 && v.speed < 1) stopped.add(v.id);
        if (x === 3.5 && !seen.has(v.id)) seen.set(v.id, s.time);
        if (x > 11.5 && seen.has(v.id) && !stopped.has(v.id) && !passedAll.includes(v.id)) passedAll.push(v.id);
      }
    }
    // A group: at least three vehicles that crossed the first light within 8 s of each other and never stopped after it.
    const times = passedAll.map((id) => seen.get(id)!).sort((a, b) => a - b);
    const group = times.some((t, i) => i + 2 < times.length && times[i + 2] - t < 8);
    expect(group).toBe(true);
  });

  it('has a short block that fills and holds traffic back at the junction before it', () => {
    let heldBack = 0;
    for (const seed of [1, 2]) {
      const s = simulate('high', seed);
      for (let i = 0; i < 180 * 30; i++) {
        s.step(STEP);
        for (const v of s.allVehicles()) {
          const [x] = xOf(s, v.id);
          if (v.reason === 'Exit lane full' && x >= 8.5 && x <= 12.5) heldBack++;
        }
      }
    }
    expect(heldBack).toBeGreaterThan(30 * 5); // vehicle-seconds × 30 steps
  });
});
