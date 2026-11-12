import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { mainStreet } from './mainStreet';
import { runScene, simulateScene, STEP } from './sceneTesting';

const graph = buildLaneGraph(mainStreet.pieces);

const simulate = (intensity: Parameters<typeof simulateScene>[1], seed: number) => simulateScene(mainStreet, intensity, seed);
const xOf = (s: TrafficSimulation, id: number) => {
  const v = s.vehicle(id);
  return mainStreet.pieces[graph.lanes[v.route[v.routeIndex]].piece].at;
};

/** Scene runs simulate minutes of traffic: allow longer than Vitest's default. */
const SLOW_TEST = 30_000;

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
      const longestStop = runScene(s, 240);
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.8);
      expect(finished).toBeGreaterThan(due * 0.5);
      // Side-street turners into the short block can miss a green or two, but nobody is stuck.
      expect(longestStop).toBeLessThan(130);
    }
  }, SLOW_TEST);

  it('sometimes lets an eastbound group through all three lights without stopping', () => {
    // At High, queues released by the first light leave as groups.
    const groupGetsThrough = (seed: number) => {
      const s = simulate('high', seed);
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
      // A group: three vehicles that crossed the first light within 10 s of each other and never stopped after it.
      const times = passedAll.map((id) => seen.get(id)!).sort((a, b) => a - b);
      return times.some((t, i) => i + 2 < times.length && times[i + 2] - t < 10);
    };
    expect([1, 2, 3, 4].filter(groupGetsThrough).length).toBeGreaterThanOrEqual(2);
  }, SLOW_TEST);

  it('has a short block that fills and backs eastbound traffic up into the junction before it', () => {
    // Moments when the eastbound short block (one tile, two lanes) holds traffic and a driver
    // at the middle junction waits for room in it.
    let heldBack = 0;
    for (const seed of [1, 2]) {
      const s = simulate('high', seed);
      for (let i = 0; i < 180 * 30; i++) {
        s.step(STEP);
        const all = s.allVehicles();
        const blockOccupied = all.some((v) => {
          const [x, z] = xOf(s, v.id);
          return x === 10.5 && z === 8.5;
        });
        if (!blockOccupied) continue;
        for (const v of all) {
          const [x, z] = xOf(s, v.id);
          const atMiddleJunction = (x === 8.5 && z === 8.5) || (x === 9.5 && (z === 6.5 || z === 9.5));
          if (atMiddleJunction && v.reason === 'Exit lane full' && v.route.some((l) => mainStreet.pieces[graph.lanes[l].piece].at[0] === 10.5 && mainStreet.pieces[graph.lanes[l].piece].at[1] === 8.5)) heldBack++;
        }
      }
    }
    expect(heldBack).toBeGreaterThan(30 * 5); // vehicle-seconds × 30 steps
  }, SLOW_TEST);
});
