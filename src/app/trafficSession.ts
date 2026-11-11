import type { LaneGraph } from '../simulation/network/buildLaneGraph';
import type { SceneDefinition } from '../simulation/network/scene';
import type { RunController } from '../simulation/runController';
import { TRIPS_PER_MINUTE } from '../simulation/traffic/intensity';
import { resolveSignals } from '../simulation/traffic/signals';
import { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { STEPS_PER_SECOND } from '../simulation/runController';

/** Seconds simulated off-screen so a scene opens with traffic already on the roads. */
const WARM_UP_SECONDS = 25;
const STEP = 1 / STEPS_PER_SECOND;

/** Stable seed per scene, so Restart and reloads replay the same arrivals, drivers and vehicles. */
function seedFor(sceneId: string) {
  let hash = 2166136261;
  for (const ch of sceneId) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/**
 * Owns the traffic simulation for one scene: rebuilds and warms it up whenever the
 * run asks for a fresh start, and advances it by the run's fixed steps.
 */
export class TrafficSession {
  simulation!: TrafficSimulation;
  private builtFor = -1;

  constructor(
    private readonly scene: SceneDefinition,
    private readonly graph: LaneGraph,
    private readonly run: RunController,
  ) {
    this.rebuild();
  }

  /** Call once per frame with the steps the run controller granted. */
  advance(steps: number) {
    if (this.run.freshStarts !== this.builtFor) this.rebuild();
    for (let i = 0; i < steps; i++) this.simulation.step(STEP);
  }

  private rebuild() {
    this.builtFor = this.run.freshStarts;
    this.simulation = new TrafficSimulation(this.graph, {
      seed: seedFor(this.scene.id),
      signals: resolveSignals(this.scene.pieces, this.graph, this.scene.controls),
      demand: { tripsPerMinute: TRIPS_PER_MINUTE[this.run.intensity], entries: this.scene.demand.gateways },
    });
    for (let i = 0; i < WARM_UP_SECONDS * STEPS_PER_SECOND; i++) this.simulation.step(STEP);
  }
}
