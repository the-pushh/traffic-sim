import { Matrix4 } from 'three';

/** What the map shows this frame, as far as deciding whether to draw it goes. */
export interface FrameState {
  /** The camera's world matrix and projection (moving, zooming, resizing, the tray's offset). */
  view: Matrix4;
  projection: Matrix4;
  /** The simulation on screen: a new one after Restart, a new load, or an edit. */
  traffic: unknown;
  /** Its clock (moves with every step) and the run's state. */
  time: number;
  state: string;
}

/**
 * Draws the map only when something it shows changed: the camera, the traffic, the run, or
 * an explicit request. An idle map costs nothing; a running one is drawn once per step.
 */
export class DrawOnDemand {
  private requested = true;
  private readonly view = new Matrix4();
  private readonly projection = new Matrix4();
  private drawn: Pick<FrameState, 'traffic' | 'time' | 'state'> | null = null;

  /** Draw on the next frame whatever happens (a scene swap, an edit, a resize). */
  request() {
    this.requested = true;
  }

  /** True when this frame differs from the last one drawn; it's then recorded as drawn. */
  changed(frame: FrameState): boolean {
    const changed =
      this.requested ||
      !frame.view.equals(this.view) ||
      !frame.projection.equals(this.projection) ||
      frame.traffic !== this.drawn?.traffic ||
      frame.time !== this.drawn?.time ||
      frame.state !== this.drawn?.state;
    if (changed) {
      this.requested = false;
      this.view.copy(frame.view);
      this.projection.copy(frame.projection);
      this.drawn = { traffic: frame.traffic, time: frame.time, state: frame.state };
    }
    return changed;
  }
}
