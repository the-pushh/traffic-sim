import { type LaneGraph, portPose } from '../network/buildLaneGraph';
import { PIECES } from '../network/pieces';
import type { ControlPlacement, PiecePlacement, SignalTiming } from '../network/scene';

export type SignalAspect = 'green' | 'amber' | 'red';

export const DEFAULT_SIGNAL_TIMING: SignalTiming = { green: 20, amber: 3, red: 20, offset: 0 };

/** A traffic light on one approach: the lanes that start at its stop line, and its cycle. */
export interface SignalControl {
  lanes: Set<number>;
  timing: SignalTiming;
}

/** Any control on one approach: the lanes that start at its stop line. */
export interface ApproachControl {
  type: 'signal' | 'stop' | 'yield';
  lanes: Set<number>;
  /** The piece and the port traffic arrives through (absent for hand-built controls). */
  piece?: number;
  port?: string;
  /** Signals only. */
  timing?: SignalTiming;
}

/** Which aspect a fixed-time signal shows at simulation time `t`: green, then amber, then red, shifted by its offset. */
export function aspectAt({ green, amber, red, offset }: SignalTiming, t: number): SignalAspect {
  const cycle = green + amber + red;
  const phase = (((t + offset) % cycle) + cycle) % cycle;
  if (phase < green) return 'green';
  if (phase < green + amber) return 'amber';
  return 'red';
}

/** The lanes of a piece that start at one of its approaches. */
function approachLanes(pieces: PiecePlacement[], graph: LaneGraph, piece: number, port: string) {
  const { centre, facing } = portPose(pieces[piece], port);
  return graph.lanes.filter((lane) => {
    if (lane.piece !== piece) return false;
    const [start, next] = [lane.points[0], lane.points[1]];
    const nearPort = Math.hypot(start[0] - centre[0], start[2] - centre[2]) < 0.45 && Math.abs(start[1] - centre[1]) < 1e-6;
    const length = Math.hypot(next[0] - start[0], next[2] - start[2]) || 1;
    const inward = ((next[0] - start[0]) * -facing[0] + (next[2] - start[2]) * -facing[1]) / length;
    return nearPort && inward > 0.5;
  });
}

/**
 * Turn a scene's control placements into the lanes each one governs. Every roundabout
 * entry also gets an implicit yield: traffic on the ring has priority.
 */
export function resolveControls(pieces: PiecePlacement[], graph: LaneGraph, controls: ControlPlacement[]): ApproachControl[] {
  const resolved: ApproachControl[] = controls.map((control) => ({
    type: control.type,
    piece: control.piece,
    port: control.port,
    lanes: new Set(approachLanes(pieces, graph, control.piece, control.port).map((l) => l.id)),
    timing: control.type === 'signal' ? (control.timing ?? DEFAULT_SIGNAL_TIMING) : undefined,
  }));
  pieces.forEach((placement, piece) => {
    if (!PIECES[placement.piece]?.ring) return;
    for (const port of PIECES[placement.piece].ports) {
      const lanes = approachLanes(pieces, graph, piece, port.id);
      if (lanes.length && !resolved.some((c) => lanes.some((l) => c.lanes.has(l.id)))) resolved.push({ type: 'yield', piece, port: port.id, lanes: new Set(lanes.map((l) => l.id)) });
    }
  });
  return resolved;
}

/** Turn a scene's signal placements into the lanes each light controls. */
export function resolveSignals(pieces: PiecePlacement[], graph: LaneGraph, controls: ControlPlacement[]): SignalControl[] {
  return resolveControls(
    pieces,
    graph,
    controls.filter((c) => c.type === 'signal'),
  )
    .filter((c) => c.type === 'signal')
    .map((c) => ({ lanes: c.lanes, timing: c.timing! }));
}
