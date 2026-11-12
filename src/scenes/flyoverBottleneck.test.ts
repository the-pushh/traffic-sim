import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { flyoverBottleneck } from './flyoverBottleneck';
import { runScene, simulateScene } from './sceneTesting';

/** Scene runs simulate minutes of traffic: allow longer than Vitest's default. */
const SLOW_TEST = 60_000;
const graph = buildLaneGraph(flyoverBottleneck.pieces);
const pieceOf = (lane: number) => flyoverBottleneck.pieces[graph.lanes[lane].piece];
const BRIDGE = flyoverBottleneck.pieces.findIndex((p) => p.piece === 'bridge');
const SURFACE_COLUMN = 8.5;
const ALTERNATIVE_ROW = 11.5;
const onAlternative = (lane: number) => pieceOf(lane).at[1] === ALTERNATIVE_ROW;
const [WEST_IN, EAST_OUT] = ['E', 'C'];
const fromWest = new Set(graph.gateways.find((g) => g.label === WEST_IN)!.entryLanes);

describe('Flyover Bottleneck preset', () => {
  it('is a valid scene that fits the board, with the route, the surface road and an open connection', () => {
    expect(validateScene(flyoverBottleneck)).toEqual([]);
    expect(graph.mismatches).toEqual([]);
    expect(graph.gateways.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(graph.openEnds).toEqual([{ at: [14, 11.5], level: 0, facing: [1, 0] }]);
    const used = new Set(flyoverBottleneck.pieces.map((p) => `${Math.floor(p.at[0])},${Math.floor(p.at[1])}`));
    expect(used.size / (BOARD_TILES * BOARD_TILES)).toBeLessThan(0.4);
  });

  it('carries the route over the surface road with no connection between them: levels change only on the ramps', () => {
    const bridgeLanes = graph.lanes.filter((l) => l.piece === BRIDGE);
    const surfaceUnder = graph.lanes.filter((l) => pieceOf(l.id).at[0] === SURFACE_COLUMN && pieceOf(l.id).piece === 'straight' && Math.abs(pieceOf(l.id).at[1] - 5) <= 0.5);
    expect(bridgeLanes.length).toBeGreaterThan(0);
    expect(surfaceUnder.length).toBeGreaterThan(0);
    const bridgeIds = new Set(bridgeLanes.map((l) => l.id));
    for (const lane of surfaceUnder) for (const next of [...lane.next, ...lane.previous]) expect(bridgeIds.has(next)).toBe(false);
    // Height only changes along ramp lanes.
    for (const lane of graph.lanes) {
      const rise = Math.abs(lane.points.at(-1)![1] - lane.points[0][1]);
      if (rise > 1e-6) expect(pieceOf(lane.id).piece).toBe('ramp');
    }
  });

  it('lets a car cross the bridge at speed over a car stopped on the road below', () => {
    const s = simulateScene({ ...flyoverBottleneck, demand: { gateways: {} } }, 'medium', 5);
    // Stopped on the surface road right under the bridge (the north arm is 4.5 tiles to the deck's centre line).
    const below = s.addVehicle({ type: 'sedan', profile: 'steady', from: 'A', to: 'D', position: 4.5 * 8.75, speed: 0 });
    s.breakDown(below, 60);
    const over = s.addVehicle({ type: 'sedan', profile: 'steady', from: WEST_IN, to: EAST_OUT, position: 50, speed: 12 });
    let slowestOnBridge = Infinity;
    runScene(s, 10, () => {
      if (s.has(over) && graph.lanes[s.vehicle(over).route[s.vehicle(over).routeIndex]].piece === BRIDGE) slowestOnBridge = Math.min(slowestOnBridge, s.vehicle(over).speed);
    });
    expect(slowestOnBridge).toBeGreaterThan(8);
    expect(s.vehicle(below).speed).toBe(0);
  }, SLOW_TEST);

  it('works as soon as it opens: traffic flows at Medium and nobody is stuck for long', () => {
    for (const seed of [1, 2, 3]) {
      const s = simulateScene(flyoverBottleneck, 'medium', seed);
      const longestStop = runScene(s, 180);
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.85);
      expect(finished).toBeGreaterThan(due * 0.6);
      expect(longestStop).toBeLessThan(90);
    }
  }, SLOW_TEST);

  it('feeds the narrowing from both eastbound lanes, so drivers merge from either side', () => {
    const s = simulateScene(flyoverBottleneck, 'high', 4);
    const lanesUsed = new Set<number>();
    const split = flyoverBottleneck.pieces.findIndex((p) => p.piece === 'split');
    runScene(s, 120, () => {
      for (const v of s.allVehicles()) if (fromWest.has(v.route[0]) && graph.lanes[v.route[v.routeIndex]].piece === split) lanesUsed.add(v.route[v.routeIndex - 1]);
    });
    expect(lanesUsed.size).toBe(2);
  }, SLOW_TEST);

  it('sends some eastbound drivers by the surface alternative when the flyover backs up', () => {
    // A heavy truck breaks down on the bridge for a minute: the flyover backs up behind it.
    const byAlternative = (breakdown: boolean) => {
      const diverted = new Set<string>();
      for (const seed of [1, 2, 3]) {
        const s = simulateScene(flyoverBottleneck, 'medium', seed);
        runScene(s, 20);
        // 74 m along the eastbound route is on the bridge deck.
        if (breakdown) s.breakDown(s.addVehicle({ type: 'heavyTruck', profile: 'steady', from: WEST_IN, to: EAST_OUT, position: 74, speed: 0 }), 80);
        runScene(s, 90, () => {
          // Any eastbound trip whose route goes by the alternative (chosen on entry or on rerouting).
          for (const v of s.allVehicles()) if (fromWest.has(v.route[0]) && v.destination === EAST_OUT && v.route.some(onAlternative)) diverted.add(`${seed}:${v.id}`);
        });
      }
      return diverted.size;
    };
    const normal = byAlternative(false);
    const backedUp = byAlternative(true);
    expect(backedUp).toBeGreaterThan(normal + 2);
  }, SLOW_TEST);
});
