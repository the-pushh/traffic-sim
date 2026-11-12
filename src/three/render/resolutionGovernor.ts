/** Never draw more than two pixels per CSS pixel (as before): beyond that costs more than it shows. */
const MAX_RATIO = 2;
/** Each step down draws this many fewer pixels per CSS pixel. */
const STEP = 0.5;
/** Frames averaged before deciding; one slow frame alone never counts. */
const WINDOW = 60;
/** Average frame time that means the computer isn't keeping up (below 50 fps), ms. */
const SLOW_MS = 20;

/**
 * Keeps the map smooth on slower computers: while the map is being drawn every frame, if
 * frames average slower than 50 fps over a second's worth, it draws fewer pixels, a step at
 * a time, down to one per screen pixel. Opening a scene starts sharp again.
 */
export class ResolutionGovernor {
  pixelRatio: number;
  private readonly best: number;
  private total = 0;
  private count = 0;

  constructor(devicePixelRatio: number) {
    this.best = Math.max(1, Math.min(devicePixelRatio, MAX_RATIO));
    this.pixelRatio = this.best;
  }

  /** One drawn frame took `ms` since the previous one. */
  frame(ms: number) {
    this.total += ms;
    this.count++;
    if (this.count < WINDOW) return;
    if (this.total / this.count > SLOW_MS && this.pixelRatio > 1) this.pixelRatio = Math.max(1, this.pixelRatio - STEP);
    this.total = this.count = 0;
  }

  reset() {
    this.pixelRatio = this.best;
    this.total = this.count = 0;
  }
}
