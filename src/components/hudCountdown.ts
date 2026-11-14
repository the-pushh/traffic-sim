import type { RunState } from '../simulation/runController';

/** What the HUD reads off the run: its state, simulated seconds so far, and its length. */
export interface RunView {
  state: RunState;
  clock: number;
  duration: number;
}

/** `m:ss`, e.g. 1:00 for a minute. */
export function formatClock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The countdown beside Play: `1:00 run` before, `42 s left` during (and paused), `Run complete` at the end. */
export function countdown({ state, clock, duration }: RunView): string {
  if (state === 'ready') return `${formatClock(duration)} run`;
  if (state === 'ended') return 'Run complete';
  return `${Math.ceil(duration - clock - 1e-9)} s left`;
}

/** How full the ring around Play is, 0 to 1: the share of the run's simulated time gone. */
export function runProgress({ state, clock, duration }: RunView): number {
  if (state === 'ended') return 1;
  return Math.min(1, Math.max(0, clock / duration));
}
