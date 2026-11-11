import type { ObserverCamera } from './observerCamera';

/** Orbit speed at full deflection, radians per second. */
const ORBIT_SPEED = 1.6;
/** Tilt speed at full deflection, radians per second. */
const TILT_SPEED = 1.0;
/** Deflection (fraction of the radius) below which the joystick does nothing. */
const DEAD_ZONE = 0.15;

/**
 * On-screen joystick logic, independent of the DOM. Left/right orbits around the
 * point in view and up/down tilts toward overhead/angled views while held. Call `update` once per frame with the elapsed time.
 */
export class CameraJoystick {
  private x = 0;
  private y = 0;

  constructor(private readonly observer: ObserverCamera) {}

  /**
   * Knob offset from the joystick centre in screen pixels (y grows downward).
   * Returns where to draw the knob, clamped to the rim.
   */
  push(dx: number, dy: number, radius: number): { x: number; y: number } {
    const length = Math.hypot(dx, dy) / radius;
    const scale = length > 1 ? 1 / length : 1;
    const x = (dx / radius) * scale;
    const y = (dy / radius) * scale;
    const active = Math.hypot(x, y) >= DEAD_ZONE;
    this.x = active ? x : 0;
    this.y = active ? y : 0;
    return { x: x * radius, y: y * radius };
  }

  release() {
    this.x = 0;
    this.y = 0;
  }

  update(seconds: number) {
    if (this.x !== 0) this.observer.orbit(this.x * ORBIT_SPEED * seconds);
    // Screen y grows downward: pushing up (negative y) reduces tilt toward overhead.
    if (this.y !== 0) this.observer.tilt(this.y * TILT_SPEED * seconds);
  }
}
