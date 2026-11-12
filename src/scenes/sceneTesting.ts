import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { laneSpeedLimits, type SceneDefinition } from '../simulation/network/scene';
import { TRIPS_PER_MINUTE } from '../simulation/traffic/intensity';
import { sceneDemand } from '../simulation/traffic/sceneDemand';
import { resolveControls } from '../simulation/traffic/signals';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';

/** Test support for preset scenes: shared by the scene tests, not used by the app. */
export const STEP = 1 / 30;

/** A simulation of a scene with its own demand pattern at an intensity, as the app runs it. */
export function simulateScene(scene: SceneDefinition, intensity: keyof typeof TRIPS_PER_MINUTE, seed: number, controls = scene.controls) {
  const graph = buildLaneGraph(scene.pieces);
  return new TrafficSimulation(graph, {
    seed,
    controls: resolveControls(scene.pieces, graph, controls),
    speedLimits: laneSpeedLimits(scene.pieces, graph),
    // No warm-up here: run time and simulation time are the same.
    demand: sceneDemand(scene.demand, TRIPS_PER_MINUTE[intensity], 0),
  });
}

/** Run for `seconds`, calling `each` after every step; returns the longest any vehicle stood still, seconds. */
export function runScene(s: TrafficSimulation, seconds: number, each?: () => void) {
  const stoppedSince = new Map<number, number>();
  let longestStop = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s.step(STEP);
    for (const v of s.allVehicles()) {
      if (v.speed > 0.1) stoppedSince.delete(v.id);
      else if (!stoppedSince.has(v.id)) stoppedSince.set(v.id, s.time);
      else longestStop = Math.max(longestStop, s.time - stoppedSince.get(v.id)!);
    }
    each?.();
  }
  return longestStop;
}
