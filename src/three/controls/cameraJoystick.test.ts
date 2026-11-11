import { describe, expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { ObserverCamera } from './observerCamera';
import { CameraJoystick } from './cameraJoystick';

const bounds = new Box3(new Vector3(-4, 0, -12), new Vector3(4, 1.5, 12));
const pointInView = bounds.getCenter(new Vector3());
const RADIUS = 40;

function setup() {
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  const observer = ObserverCamera.framing(camera, bounds);
  return { camera, joystick: new CameraJoystick(observer) };
}

function degreesFromStraightDown(camera: PerspectiveCamera) {
  return (camera.getWorldDirection(new Vector3()).angleTo(new Vector3(0, -1, 0)) * 180) / Math.PI;
}

describe('camera joystick', () => {
  it('orbits around the point in view toward screen-right when pushed right', () => {
    const { camera, joystick } = setup();
    const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const start = camera.position.clone();
    const startDistance = start.distanceTo(pointInView);

    joystick.push(RADIUS, 0, RADIUS);
    joystick.update(0.5);

    const moved = camera.position.clone().sub(start);
    expect(moved.dot(screenRight)).toBeGreaterThan(0.5);
    expect(camera.position.distanceTo(pointInView)).toBeCloseTo(startDistance, 6);
  });

  it('tilts toward overhead when pushed up and toward an angled view when pushed down', () => {
    const { camera, joystick } = setup();
    const startTilt = degreesFromStraightDown(camera);

    joystick.push(0, -RADIUS, RADIUS);
    joystick.update(0.2);
    const afterUp = degreesFromStraightDown(camera);
    expect(afterUp).toBeLessThan(startTilt - 3);

    joystick.push(0, RADIUS, RADIUS);
    joystick.update(0.6);
    expect(degreesFromStraightDown(camera)).toBeGreaterThan(afterUp + 10);
  });

  it('stops moving the camera when released', () => {
    const { camera, joystick } = setup();
    joystick.push(RADIUS, RADIUS, RADIUS);
    joystick.update(0.1);
    joystick.release();
    const held = camera.position.clone();

    joystick.update(1);

    expect(camera.position.distanceTo(held)).toBe(0);
  });

  it('ignores a tiny accidental nudge near the centre', () => {
    const { camera, joystick } = setup();
    const start = camera.position.clone();

    joystick.push(2, -2, RADIUS);
    joystick.update(1);

    expect(camera.position.distanceTo(start)).toBe(0);
  });

  it('moves no faster when dragged past the rim', () => {
    const atRim = setup();
    atRim.joystick.push(RADIUS, 0, RADIUS);
    atRim.joystick.update(0.3);

    const pastRim = setup();
    pastRim.joystick.push(RADIUS * 5, 0, RADIUS);
    pastRim.joystick.update(0.3);

    expect(pastRim.camera.position.distanceTo(atRim.camera.position)).toBeLessThan(1e-9);
  });

  it('reports where to draw the knob, kept inside the rim', () => {
    const { joystick } = setup();
    const knob = joystick.push(RADIUS * 3, RADIUS * 4, RADIUS);
    expect(knob.x).toBeCloseTo(24, 9);
    expect(knob.y).toBeCloseTo(32, 9);
  });
});
