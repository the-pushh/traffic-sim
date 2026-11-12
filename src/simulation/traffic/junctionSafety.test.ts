import { describe, expect, it } from 'vitest';
import { testNetwork } from '../../scenes/testNetwork';
import { buildLaneGraph } from '../network/buildLaneGraph';
import { pointAlongLane } from '../network/laneGeometry';
import type { PiecePlacement } from '../network/scene';
import { resolveControls } from './signals';
import { METRES_PER_TILE, TrafficSimulation, type VehicleState } from './trafficSimulation';

const STEP = 1 / 30;

/** Every point along a vehicle's body from rear to front, on the board in metres. */
function body(_s: TrafficSimulation, g: ReturnType<typeof buildLaneGraph>, v: VehicleState) {
  const points: [number, number, number][] = [];
  for (let back = 0; back <= v.type.length; back += 1) {
    let index = v.routeIndex;
    let distance = (v.position - back) / METRES_PER_TILE;
    while (distance < 0 && index > 0) {
      index--;
      distance += g.lanes[v.route[index]].length;
    }
    const { point } = pointAlongLane(g.lanes[v.route[index]], distance);
    points.push([point[0] * METRES_PER_TILE, point[1] * METRES_PER_TILE, point[2] * METRES_PER_TILE]);
  }
  return points;
}

/** Closest approach between two vehicles' centrelines, metres (side by side in adjacent lanes is 3.5 m). */
function closest(a: [number, number, number][], b: [number, number, number][]) {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  return best;
}

function assertNoCollisions(pieces: PiecePlacement[], controls: Parameters<typeof resolveControls>[2], entries: Record<string, number>, seconds: number, seed: number, tripsPerMinute = 10) {
  const g = buildLaneGraph(pieces);
  const s = new TrafficSimulation(g, { seed, controls: resolveControls(pieces, g, controls), demand: { tripsPerMinute, entries } });
  const touching: string[] = [];
  const stoppedSince = new Map<number, number>();
  let longestStop = 0;
  for (let i = 0; i < seconds * 30; i++) {
    s.step(STEP);
    for (const v of s.allVehicles()) {
      if (v.speed >= 0.1) stoppedSince.delete(v.id);
      else {
        if (!stoppedSince.has(v.id)) stoppedSince.set(v.id, s.time);
        longestStop = Math.max(longestStop, s.time - stoppedSince.get(v.id)!);
      }
    }
    if (i % 3) continue;
    const all = s.allVehicles();
    const bodies = all.map((v) => body(s, g, v));
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++) {
        // Two centrelines closer than 1.5 m means the vehicles are overlapping.
        if (closest(bodies[a], bodies[b]) < 1.5 && touching.length < 5) touching.push(`t=${s.time.toFixed(1)} ${all[a].id}/${all[b].id}`);
      }
  }
  return { touching, counts: s.counts, longestStop };
}

describe('junction safety', () => {
  it('never lets vehicles overlap anywhere on the test network, and keeps traffic flowing', () => {
    const { touching, counts, longestStop } = assertNoCollisions(testNetwork.pieces, testNetwork.controls, testNetwork.demand.gateways, 240, 21);
    expect(touching).toEqual([]);
    // Flowing, not gridlocked: most trips that arrive get through, and nobody waits longer than a couple of signal cycles.
    expect(counts.finished).toBeGreaterThan(counts.due * 0.6);
    expect(longestStop).toBeLessThan(90);
  });

  it('resolves four-way give-way-to-the-right and two yield signs facing each other without a crash or a standoff', () => {
    const pieces: PiecePlacement[] = [{ piece: 'crossroad', at: [8.5, 8.5], rotation: 0 }];
    for (let x = 0.5; x < 16; x++) if (x !== 8.5) pieces.push({ piece: 'straight', at: [x, 8.5], rotation: 0 });
    for (let z = 0.5; z < 16; z++) if (z !== 8.5) pieces.push({ piece: 'straight', at: [8.5, z], rotation: 90 });
    const all = { A: 1, B: 1, C: 1, D: 1 };
    for (const controls of [[], [{ type: 'yield' as const, piece: 0, port: 'n' }, { type: 'yield' as const, piece: 0, port: 'e' }]]) {
      // 6 trips a minute per arm (1,440 an hour): within what an unsignalised single-lane crossroads can carry.
      const { touching, counts, longestStop } = assertNoCollisions(pieces, controls, all, 180, 22, 6);
      expect(touching).toEqual([]);
      expect(counts.finished).toBeGreaterThan(counts.due * 0.6);
      expect(longestStop).toBeLessThan(90);
    }
  });
});
