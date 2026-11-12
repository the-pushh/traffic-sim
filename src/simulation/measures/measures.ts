import { portPose } from '../network/buildLaneGraph';
import type { PiecePlacement } from '../network/scene';
import type { ApproachControl } from '../traffic/signals';
import type { TrafficSimulation } from '../traffic/trafficSimulation';

/** A controlled approach as players see it: a name and where its stop line is (board tiles). */
export interface Approach {
  name: string;
  /** Centre of the approach's stop line on the board, tiles: [x, level, z]. */
  at: [number, number, number];
  /** Unit vector pointing back up the approach (towards arriving traffic), [x, z]. */
  upstream: [number, number];
}

/** What a run measured, as absolute numbers with their sample sizes. */
export interface RunResults {
  due: number;
  entered: number;
  finished: number;
  blocked: number;
  /** Mean seconds from entering the board to leaving it, over finished trips; null when none finished. */
  averageTravelTime: number | null;
  /** How many finished trips the average is taken over. */
  travelTimeSamples: number;
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
 * Name each approach by its junction (pieces that touch count as one, numbered west to
 * east then north to south within each kind) and the direction traffic arrives in.
 */
export function describeApproaches(pieces: PiecePlacement[], controls: ApproachControl[]): Approach[] {
  const controlled = [...new Set(controls.map((c) => c.piece).filter((p): p is number => p !== undefined))];
  // Group touching pieces (e.g. the two tiles where a divided road crosses a side street).
  const group = new Map<number, number>(controlled.map((p) => [p, p]));
  const root = (p: number): number => (group.get(p) === p ? p : root(group.get(p)!));
  for (const a of controlled)
    for (const b of controlled) {
      const [pa, pb] = [pieces[a].at, pieces[b].at];
      if (a < b && Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) <= 1 + 1e-9) group.set(root(b), root(a));
    }
  const roots = [...new Set(controlled.map(root))];
  const centre = (r: number) => {
    const members = controlled.filter((p) => root(p) === r).map((p) => pieces[p].at);
    return [members.reduce((s, m) => s + m[0], 0) / members.length, members.reduce((s, m) => s + m[1], 0) / members.length];
  };
  const names = new Map<number, string>();
  const counters = new Map<string, number>();
  for (const r of roots.sort((a, b) => centre(a)[0] - centre(b)[0] || centre(a)[1] - centre(b)[1])) {
    const kind = groupKind(pieces[r].piece);
    counters.set(kind, (counters.get(kind) ?? 0) + 1);
    names.set(r, `${kind} ${counters.get(kind)}`);
  }
  return controls.map((control, i) => {
    if (control.piece === undefined || control.port === undefined) return { name: `Approach ${i + 1}`, at: [0, 0, 0], upstream: [0, 0] };
    const { centre: at, facing } = portPose(pieces[control.piece], control.port);
    // Traffic arrives heading against the port's outward direction.
    const heading = [-facing[0], -facing[1]];
    const direction = DIRECTIONS.find(([x, z]) => Math.abs(heading[0] - x) < 0.5 && Math.abs(heading[1] - z) < 0.5)?.[2] ?? 'arriving';
    return { name: `${names.get(root(control.piece))} · ${direction}`, at, upstream: [facing[0], facing[1]] };
  });
}

/** Live and peak queue length at each approach over a run. */
export class QueueTracker {
  live: number[];
  peak: number[];

  constructor(approaches: number) {
    this.live = Array(approaches).fill(0);
    this.peak = Array(approaches).fill(0);
  }

  sample(queues: number[]) {
    this.live = [...queues];
    this.peak = this.peak.map((p, i) => Math.max(p, queues[i] ?? 0));
  }

  reset() {
    this.live = this.live.map(() => 0);
    this.peak = this.peak.map(() => 0);
  }
}

/** The run's measures so far. */
export function summariseRun(simulation: TrafficSimulation, queues: QueueTracker, approaches: Approach[]): RunResults {
  const { due, entered, finished, blocked } = simulation.counts;
  const times = simulation.travelTimes;
  return {
    due,
    entered,
    finished,
    blocked,
    averageTravelTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    travelTimeSamples: times.length,
    peakQueues: approaches.map((a, i) => ({ approach: a.name, peak: queues.peak[i] ?? 0 })),
  };
}
