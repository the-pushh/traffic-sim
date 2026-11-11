import { Box3, PerspectiveCamera, Sphere, Vector3 } from 'three';

/** Where the camera looks and how it orbits around that point. Angles in radians. */
export interface CameraPose {
  target: Vector3;
  distance: number;
  /** Rotation around the vertical axis. */
  azimuth: number;
  /** Angle away from straight down: 0 is overhead. */
  tilt: number;
}

const START_TILT = (25 * Math.PI) / 180;
/** Just off vertical: an exactly vertical view makes lookAt's orientation undefined. */
const MIN_TILT = 0.001;
const MAX_TILT = (70 * Math.PI) / 180;
const MIN_DISTANCE = 2;
const MAX_DISTANCE_FACTOR = 3;

/**
 * Observer camera for the traffic scene. Owns only the camera, never scene
 * objects, so camera moves cannot alter the layout or simulation.
 */
export class ObserverCamera {
  private pose: CameraPose;

  private constructor(
    private readonly camera: PerspectiveCamera,
    private readonly initialPose: CameraPose,
  ) {
    this.pose = clonePose(initialPose);
    this.apply();
  }

  /** Frame the given bounds from above with a slight tilt. */
  static framing(camera: PerspectiveCamera, bounds: Box3): ObserverCamera {
    const target = bounds.getCenter(new Vector3());
    const radius = bounds.getBoundingSphere(new Sphere()).radius;
    return new ObserverCamera(camera, { target, distance: radius * 3, azimuth: 0, tilt: START_TILT });
  }

  /** Rotate around the point in view (radians, positive = counter-clockwise from above). */
  orbit(radians: number) {
    this.pose.azimuth += radians;
    this.apply();
  }

  /** Tilt between overhead (0) and angled views (radians). */
  tilt(radians: number) {
    this.pose.tilt = clamp(this.pose.tilt + radians, MIN_TILT, MAX_TILT);
    this.apply();
  }

  /** Move across the map, in world units relative to the current screen orientation. */
  pan(right: number, forward: number) {
    const { azimuth } = this.pose;
    const rightDir = new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const forwardDir = new Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    this.pose.target.addScaledVector(rightDir, right).addScaledVector(forwardDir, forward);
    this.apply();
  }

  /**
   * Pan by a pointer drag in screen pixels, so the point in view follows the pointer.
   * `viewportHeight` is the drawing area's height in the same pixels.
   */
  dragPan(dx: number, dy: number, viewportHeight: number) {
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const worldPerPixel = (2 * this.pose.distance * Math.tan(halfFov)) / viewportHeight;
    this.pan(-dx * worldPerPixel, dy * worldPerPixel);
  }

  /** Multiply the viewing distance: below 1 zooms in, above 1 zooms out. */
  zoom(factor: number) {
    const maxDistance = this.initialPose.distance * MAX_DISTANCE_FACTOR;
    this.pose.distance = clamp(this.pose.distance * factor, MIN_DISTANCE, maxDistance);
    this.apply();
  }

  /** Restore the starting camera position and angle. */
  resetView() {
    this.pose = clonePose(this.initialPose);
    this.apply();
  }

  private apply() {
    const { target, distance, azimuth, tilt } = this.pose;
    const offset = new Vector3().setFromSphericalCoords(distance, tilt, azimuth);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clonePose(p: CameraPose): CameraPose {
  return { ...p, target: p.target.clone() };
}
