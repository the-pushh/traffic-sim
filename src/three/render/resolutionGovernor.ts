/** Never draw more than two pixels per CSS pixel (as before): beyond that costs more than it shows. */
const MAX_RATIO = 2;
/** Each step down draws this many fewer pixels per CSS pixel. */
const STEP = 0.5;
/** Frames averaged before deciding; one slow frame alone never counts. */
const WINDOW = 60;
/** Frames averaging this much longer than the screen's own frame interval mean the computer isn't keeping up. */
const SLOW_FACTOR = 1.4;
/** And never slower than 50 fps counts as keeping up on its own, ms. */
const SLOW_MS = 20;

/**
 * Keeps the map smooth on slower computers: while the map is being drawn, if frames average
 * well behind the screen's own frame rate (the shortest frame seen, so a browser capped at
 * 30 fps or a 50 Hz screen isn't mistaken for a slow computer) over a second's worth, it
 * draws fewer pixels, a step at a time, down to one per screen pixel. Opening a scene starts
 * sharp again.
 */
export class ResolutionGovernor {
  pixelRatio: number;
  private readonly best: number;
  private total = 0;
  private count = 0;
  /** The shortest frame seen since the scene opened: the screen's (or browser's) frame interval. */
  private interval = Infinity;

  constructor(devicePixelRatio: number) {
    this.best = Math.max(1, Math.min(devicePixelRatio, MAX_RATIO));
    this.pixelRatio = this.best;
  }

  /** One drawn frame took `ms` since the previous one. */
  frame(ms: number) {
    this.interval = Math.min(this.interval, ms);
    this.total += ms;
    this.count++;
    if (this.count < WINDOW) return;
    const slow = Math.max(SLOW_MS, this.interval * SLOW_FACTOR);
    if (this.total / this.count > slow && this.pixelRatio > 1) this.pixelRatio = Math.max(1, this.pixelRatio - STEP);
    this.total = this.count = 0;
  }

  /** A frame where nothing was drawn took `ms`: the pace the screen (or browser) sets, nothing more. */
  idle(ms: number) {
    this.interval = Math.min(this.interval, ms);
  }

  reset() {
    this.pixelRatio = this.best;
    this.total = this.count = 0;
    this.interval = Infinity;
  }
}
