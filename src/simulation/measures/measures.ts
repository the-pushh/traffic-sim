import { type LaneGraph, portPose } from '../network/buildLaneGraph';
import { findConflicts } from '../network/conflicts';
import { junctionClusters } from '../network/junctions';
import type { PiecePlacement } from '../network/scene';
import type { ApproachControl } from '../traffic/signals';
import type { TrafficSimulation } from '../traffic/trafficSimulation';

/** A controlled approach as players see it: a name and where its stop line is (board tiles). */
export interface Approach {
  name: string;
  /** Centre of the approach's stop line on the board, tiles: [x, level, z]; null for a control placed by hand without a piece. */
  at: [number, number, number] | null;
  /** Unit vector pointing back up the approach (towards arriving traffic), [x, z]. */
  upstream: [number, number];
}

/** What a run measured, as absolute numbers with their sample sizes. */
export interface RunResults {
  due: number;
  entered: number;
  finished: number;
  blocked: number;
  /**
   * Mean seconds a finished trip lost against driving its own route on empty roads (waiting
   * at lights, in queues, behind slower cars); null when none finished. Travel time itself
   * isn't comparable: every trip's route is a different length.
   */
  averageDelay: number | null;
  /** How many finished trips the average is taken over. */
  delaySamples: number;
  /** The longest queue at each approach during the run, vehicles. */
  peakQueues: { approach: string; peak: number }[];
}

const DIRECTIONS: [number, number, string][] = [
  [1, 0, 'eastbound'],
  [-1, 0, 'westbound'],
  [0, 1, 'southbound'],
  [0, -1, 'northbound'],
];

/** What to call a group of adjacent controlled pieces. */
function groupKind(piece: string) {
  if (piece === 'roundabout') return 'Roundabout';
  if (piece === 'crossing') return 'Crossing';
  return 'Junction';
}

/**
 * Name each approach by its junction (the same grouping the simulation drives by: junction
 * pieces whose lanes join directly are one junction, e.g. the two tiles where a divided
 * road meets a side street), numbered west to east then north to south within each kind,
 * and the direction traffic arrives in.
 */
export function describeApproaches(pieces: PiecePlacement[], graph: LaneGraph, controls: ApproachControl[]): Approach[] {
  const cluster = junctionClusters(graph, findConflicts(graph));
  // Which junction each controlled piece belongs to: its cluster, or the piece itself (e.g. a crossing).
  const junctionOf = (piece: number) => {
    const lane = graph.lanes.find((l) => l.piece === piece);
    return lane && cluster[lane.id] >= 0 ? `c${cluster[lane.id]}` : `p${piece}`;
  };
  const controlled = [...new Set(controls.map((c) => c.piece).filter((p): p is number => p !== undefined))];
  const members = new Map<string, number[]>();
  for (const piece of controlled) members.set(junctionOf(piece), [...(members.get(junctionOf(piece)) ?? []), piece]);
  const centre = (key: string) => {
    const at = members.get(key)!.map((p) => pieces[p].at);
    return [at.reduce((s, a) => s + a[0], 0) / at.length, at.reduce((s, a) => s + a[1], 0) / at.length];
  };
  const names = new Map<string, string>();
  const counters = new Map<string, number>();
  for (const key of [...members.keys()].sort((a, b) => centre(a)[0] - centre(b)[0] || centre(a)[1] - centre(b)[1])) {
    const kind = groupKind(pieces[members.get(key)![0]].piece);
    counters.set(kind, (counters.get(kind) ?? 0) + 1);
    names.set(key, `${kind} ${counters.get(kind)}`);
  }
  return controls.map((control, i) => {
    if (control.piece === undefined || control.port === undefined) return { name: `Approach ${i + 1}`, at: null, upstream: [0, 0] };
    const { centre: at, facing } = portPose(pieces[control.piece], control.port);
    // Traffic arrives heading against the port's outward direction.
    const heading = [-facing[0], -facing[1]];
    const direction = DIRECTIONS.find(([x, z]) => Math.abs(heading[0] - x) < 0.5 && Math.abs(heading[1] - z) < 0.5)?.[2] ?? 'arriving';
    return { name: `${names.get(junctionOf(control.piece))} · ${direction}`, at, upstream: [facing[0], facing[1]] };
  });
}

/** Live and peak queue length at each approach over a run. */
export class QueueTracker {
  /** Vehicles queued at each approach at the last sample. */
  readonly live: number[];
  /** The most queued at each approach since the last reset. */
  readonly peak: number[];

  constructor(approaches: number) {
    this.live = Array(approaches).fill(0);
    this.peak = Array(approaches).fill(0);
  }

  /** Record this moment's queues (updated in place: cheap enough to call every step). */
  sample(queues: readonly number[]) {
    for (let i = 0; i < this.live.length; i++) {
      this.live[i] = queues[i] ?? 0;
      if (this.live[i] > this.peak[i]) this.peak[i] = this.live[i];
    }
  }

  /** Start a new run's peaks. */
  reset() {
    this.live.fill(0);
    this.peak.fill(0);
  }
}

/** The run's measures so far. */
export function summariseRun(simulation: TrafficSimulation, queues: QueueTracker, approaches: Approach[]): RunResults {
  const { due, entered, finished, blocked } = simulation.counts;
  const delays = simulation.tripDelays;
  return {
    due,
    entered,
    finished,
    blocked,
    averageDelay: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    delaySamples: delays.length,
    peakQueues: approaches.map((a, i) => ({ approach: a.name, peak: queues.peak[i] ?? 0 })),
  };
}
