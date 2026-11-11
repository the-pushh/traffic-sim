export type RunState = 'ready' | 'running' | 'paused' | 'ended';
/**
 * What Play means for the simulation: `start` a fresh run from the warm-up state,
 * `resume` after a pause, or `continue` from the frozen traffic after a run ended.
 */
export type PlayKind = 'start' | 'resume' | 'continue';
export type RunDuration = 30 | 60 | 90;
export const RUN_DURATIONS: readonly RunDuration[] = [30, 60, 90];

/** Abstract traffic intensity ticks, lowest to highest. */
export const INTENSITIES = ['almost-empty', 'low', 'medium', 'high', 'congested'] as const;
export type Intensity = (typeof INTENSITIES)[number];

/** Simulation steps per simulated second. */
export const STEPS_PER_SECOND = 30;

/**
 * The run lifecycle from the spec: Ready → Running ⇄ Paused → Ended. Independent
 * of rendering so it can be tested directly. Time is counted in whole fixed steps
 * so a run always ends exactly at its duration.
 */
export class RunController {
  state: RunState = 'ready';
  duration: RunDuration = 30;
  intensity: Intensity = 'medium';
  private stepsDone = 0;
  private pendingSeconds = 0;

  /** Simulated seconds elapsed in the current run. */
  get clock() {
    return this.stepsDone / STEPS_PER_SECOND;
  }

  get settingsLocked() {
    return this.state === 'running' || this.state === 'paused';
  }

  play(): PlayKind | null {
    const kind = PLAY_KIND[this.state];
    if (!kind) return null;
    if (kind === 'continue') {
      this.stepsDone = 0;
      this.pendingSeconds = 0;
    }
    this.state = 'running';
    return kind;
  }

  /** Back to Ready at 0:00; the simulation rebuilds its warm-up state from the same seed. */
  restart() {
    this.state = 'ready';
    this.stepsDone = 0;
    this.pendingSeconds = 0;
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
  }

  /** Returns false (and changes nothing) while the run's settings are locked. */
  setDuration(duration: RunDuration): boolean {
    if (this.settingsLocked) return false;
    this.duration = duration;
    return true;
  }

  /** Returns false (and changes nothing) while the run's settings are locked. */
  setIntensity(intensity: Intensity): boolean {
    if (this.settingsLocked) return false;
    this.intensity = intensity;
    return true;
  }

  /**
   * Advance by real elapsed seconds. Returns how many fixed simulation steps to run
   * this frame; never runs past the end of the run.
   */
  tick(seconds: number): number {
    if (this.state !== 'running') return 0;
    this.pendingSeconds += seconds;
    const due = Math.floor(this.pendingSeconds * STEPS_PER_SECOND + 1e-9);
    this.pendingSeconds -= due / STEPS_PER_SECOND;
    const remaining = this.duration * STEPS_PER_SECOND - this.stepsDone;
    const steps = Math.min(due, remaining);
    this.stepsDone += steps;
    if (this.stepsDone >= this.duration * STEPS_PER_SECOND) {
      this.state = 'ended';
      this.pendingSeconds = 0;
    }
    return steps;
  }
}

const PLAY_KIND: Record<RunState, PlayKind | null> = {
  ready: 'start',
  paused: 'resume',
  ended: 'continue',
  running: null,
};
