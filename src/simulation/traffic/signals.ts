import { type LaneGraph, portPose } from '../network/buildLaneGraph';
import type { ControlPlacement, PiecePlacement, SignalTiming } from '../network/scene';

export type SignalAspect = 'green' | 'amber' | 'red';

export const DEFAULT_SIGNAL_TIMING: SignalTiming = { green: 20, amber: 3, red: 20, offset: 0 };

/** A traffic light on one approach: the lanes that start at its stop line, and its cycle. */
export interface SignalControl {
  lanes: Set<number>;
  timing: SignalTiming;
}

/** Which aspect a fixed-time signal shows at simulation time `t`: green, then amber, then red, shifted by its offset. */
export function aspectAt({ green, amber, red, offset }: SignalTiming, t: number): SignalAspect {
  const cycle = green + amber + red;
  const phase = (((t + offset) % cycle) + cycle) % cycle;
  if (phase < green) return 'green';
  if (phase < green + amber) return 'amber';
  return 'red';
}

/** Turn a scene's signal placements into the lanes each light controls. */
export function resolveSignals(pieces: PiecePlacement[], graph: LaneGraph, controls: ControlPlacement[]): SignalControl[] {
  return controls
    .filter((c) => c.type === 'signal')
    .map((control) => {
      const { centre, facing } = portPose(pieces[control.piece], control.port);
      const lanes = graph.lanes.filter((lane) => {
        if (lane.piece !== control.piece) return false;
        const [start, next] = [lane.points[0], lane.points[1]];
        const nearPort = Math.hypot(start[0] - centre[0], start[2] - centre[2]) < 0.45 && Math.abs(start[1] - centre[1]) < 1e-6;
        const length = Math.hypot(next[0] - start[0], next[2] - start[2]) || 1;
        const inward = ((next[0] - start[0]) * -facing[0] + (next[2] - start[2]) * -facing[1]) / length;
        return nearPort && inward > 0.5;
      });
      return { lanes: new Set(lanes.map((l) => l.id)), timing: control.timing ?? DEFAULT_SIGNAL_TIMING };
    });
}
