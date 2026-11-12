import type { LaneGraph } from '../network/buildLaneGraph';
import { laneSpeedLimits, type SceneDefinition } from '../network/scene';
import { type Approach, describeApproaches, QueueTracker, type RunResults, summariseRun } from '../measures/measures';
import type { Intensity, RunController, RunDuration, RunState } from '../runController';
import { TRIPS_PER_MINUTE } from './intensity';
import { sceneDemand } from './sceneDemand';
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
  approaches!: Approach[];
  private controls!: ApproachControl[];
  private queues!: QueueTracker;
  private builtFor = -1;
  private readonly queueBuffer: number[] = [];
  private lastState: RunState = 'ready';

  constructor(
    private scene: SceneDefinition,
    private graph: LaneGraph,
    private readonly run: RunController,
  ) {
    this.useNetwork(scene, graph);
    this.rebuild();
  }

  /**
   * The player edited the network. Paused mid-run, the traffic carries on over the new
   * network (vehicles stay put and reroute; trips with no way through are blocked). Before a
   * run or after one ends, it starts afresh from Ready.
   */
  edit(scene: SceneDefinition, graph: LaneGraph) {
    const peaks = new Map(this.approaches.map((a, i) => [a.name, this.queues.peak[i]]));
    this.useNetwork(scene, graph);
    if (this.run.state === 'paused' || this.run.state === 'running') {
      this.simulation = TrafficSimulation.continueFrom(this.simulation, graph, this.options());
      // Approaches that are still there keep their peak queue for this run.
      this.approaches.forEach((a, i) => (this.queues.peak[i] = peaks.get(a.name) ?? 0));
      return;
    }
    if (this.run.state === 'ended') this.run.restart();
    this.rebuild();
  }

  private useNetwork(scene: SceneDefinition, graph: LaneGraph) {
    this.scene = scene;
    this.graph = graph;
    this.controls = resolveControls(scene.pieces, graph, scene.controls);
    this.approaches = describeApproaches(scene.pieces, graph, this.controls);
    this.queues = new QueueTracker(this.controls.length);
  }

  private options() {
    return {
      seed: seedFor(this.scene.id),
      controls: this.controls,
      speedLimits: laneSpeedLimits(this.scene.pieces, this.graph),
      demand: sceneDemand(this.scene.demand, TRIPS_PER_MINUTE[this.run.intensity], WARM_UP_SECONDS),
    };
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
      this.queues.sample(this.simulation.queueLengths(this.queueBuffer));
    }
  }

  /** The run's measures so far, labelled with the scene, intensity and duration. */
  results(): LabelledResults {
    return { scene: this.scene.name, intensity: this.run.intensity, duration: this.run.duration, ...summariseRun(this.simulation, this.queues, this.approaches) };
  }

  /** Vehicles queued at each approach right now, in `approaches` order. */
  liveQueues(): readonly number[] {
    return this.queues.live;
  }

  private rebuild() {
    this.builtFor = this.run.freshStarts;
    this.simulation = new TrafficSimulation(this.graph, this.options());
    for (let i = 0; i < WARM_UP_SECONDS * STEPS_PER_SECOND; i++) this.simulation.step(STEP);
    // Measures cover the run itself, not the warm-up.
    this.simulation.resetCounts();
    this.queues.reset();
    this.queues.sample(this.simulation.queueLengths());
  }
}
