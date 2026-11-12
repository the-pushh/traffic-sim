import type { LaneGraph } from '../network/buildLaneGraph';
import type { SceneDefinition } from '../network/scene';
import { type Approach, describeApproaches, QueueTracker, type RunResults, summariseRun } from '../measures/measures';
import type { Intensity, RunController, RunDuration, RunState } from '../runController';
import { TRIPS_PER_MINUTE } from './intensity';
import { type ApproachControl, resolveControls } from './signals';
import { TrafficSimulation } from './trafficSimulation';
import { STEPS_PER_SECOND } from '../runController';

/** Seconds simulated off-screen so a scene opens with traffic already on the roads. */
const WARM_UP_SECONDS = 25;
const STEP = 1 / STEPS_PER_SECOND;

/** A run's results labelled with what was run. */
export interface LabelledResults extends RunResults {
  scene: string;
  intensity: Intensity;
  duration: RunDuration;
}

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
  /** The scene's controlled approaches, in the simulation's control order. */
  readonly approaches: Approach[];
  private readonly controls: ApproachControl[];
  private readonly queues: QueueTracker;
  private builtFor = -1;
  private lastState: RunState = 'ready';

  constructor(
    private readonly scene: SceneDefinition,
    private readonly graph: LaneGraph,
    private readonly run: RunController,
  ) {
    this.controls = resolveControls(scene.pieces, graph, scene.controls);
    this.approaches = describeApproaches(scene.pieces, this.controls);
    this.queues = new QueueTracker(this.controls.length);
    this.rebuild();
  }

  /** Call once per frame with the steps the run controller granted. */
  advance(steps: number) {
    if (this.run.freshStarts !== this.builtFor) this.rebuild();
    // Play after a run ends continues the same traffic as a new run: measure it afresh.
    if (this.lastState === 'ended' && this.run.state === 'running') {
      this.simulation.resetCounts();
      this.queues.reset();
    }
    this.lastState = this.run.state;
    for (let i = 0; i < steps; i++) {
      this.simulation.step(STEP);
      this.queues.sample(this.simulation.queueLengths());
    }
  }

  /** The run's measures so far, labelled with the scene, intensity and duration. */
  results(): LabelledResults {
    return { scene: this.scene.name, intensity: this.run.intensity, duration: this.run.duration, ...summariseRun(this.simulation, this.queues, this.approaches) };
  }

  /** Vehicles queued at each approach right now. */
  liveQueues(): { approach: Approach; live: number }[] {
    return this.approaches.map((approach, i) => ({ approach, live: this.queues.live[i] }));
  }

  private rebuild() {
    this.builtFor = this.run.freshStarts;
    this.simulation = new TrafficSimulation(this.graph, {
      seed: seedFor(this.scene.id),
      controls: this.controls,
      demand: { tripsPerMinute: TRIPS_PER_MINUTE[this.run.intensity], entries: this.scene.demand.gateways, destinations: this.scene.demand.destinations },
    });
    for (let i = 0; i < WARM_UP_SECONDS * STEPS_PER_SECOND; i++) this.simulation.step(STEP);
    // Measures cover the run itself, not the warm-up.
    this.simulation.resetCounts();
    this.queues.reset();
    this.queues.sample(this.simulation.queueLengths());
  }
}
