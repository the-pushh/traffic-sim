/** The detent nearest a continuous position from 0 (first) to 1 (last), of `count` evenly spaced. */
export function nearestDetent(position: number, count: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  return Math.round(clamped * (count - 1));
}

/** A knob's pointer angle for a detent, degrees from twelve o'clock (clockwise positive), over `sweep` degrees. */
export function detentAngle(index: number, count: number, sweep: number): number {
  return -sweep / 2 + (index * sweep) / (count - 1);
}

/** Where along a track a value sits, px; `start` and `end` are the first and last scale marks. */
export function travelPosition(value: number, max: number, track: { start: number; end: number }): number {
  return track.start + (value / max) * (track.end - track.start);
}

/** The value at a position along a track, held to the ends of travel. */
export function travelValue(position: number, max: number, track: { start: number; end: number }): number {
  const t = (position - track.start) / (track.end - track.start);
  return Math.min(max, Math.max(0, t * max));
}

/** A stick tilt (−1…1 each way) held inside the unit circle, keeping its direction. */
export function clampTilt(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  return length <= 1 ? { x, y } : { x: x / length, y: y / length };
}
