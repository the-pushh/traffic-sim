import type { LaneGraph } from '../network/buildLaneGraph';
import type { SceneDefinition } from '../network/scene';
import type { RunController } from '../runController';
import { TRIPS_PER_MINUTE } from './intensity';
import { resolveControls } from './signals';
import { TrafficSimulation } from './trafficSimulation';
import { STEPS_PER_SECOND } from '../runController';

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
      controls: resolveControls(this.scene.pieces, this.graph, this.scene.controls),
      demand: { tripsPerMinute: TRIPS_PER_MINUTE[this.run.intensity], entries: this.scene.demand.gateways },
    });
    for (let i = 0; i < WARM_UP_SECONDS * STEPS_PER_SECOND; i++) this.simulation.step(STEP);
    // Measures cover the run itself, not the warm-up.
    this.simulation.resetCounts();
  }
}
