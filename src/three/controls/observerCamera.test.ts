import { describe, expect, it } from 'vitest';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { ObserverCamera } from './observerCamera';

const roadBounds = new Box3(new Vector3(-4, 0, -12), new Vector3(4, 1.5, 12));

function makeObserver() {
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  const observer = ObserverCamera.framing(camera, roadBounds);
  return { camera, observer };
}

function degreesFromStraightDown(camera: PerspectiveCamera) {
  const look = camera.getWorldDirection(new Vector3());
  return (look.angleTo(new Vector3(0, -1, 0)) * 180) / Math.PI;
}

describe('ObserverCamera initial framing', () => {
  it('looks down at the scene from above with a slight tilt', () => {
    const { camera } = makeObserver();

    expect(camera.position.y).toBeGreaterThan(roadBounds.max.y);
    const tilt = degreesFromStraightDown(camera);
    expect(tilt).toBeGreaterThanOrEqual(15);
    expect(tilt).toBeLessThanOrEqual(35);
  });
});

function boundsCorners(b: Box3) {
  const corners: Vector3[] = [];
  for (const x of [b.min.x, b.max.x])
    for (const y of [b.min.y, b.max.y])
      for (const z of [b.min.z, b.max.z]) corners.push(new Vector3(x, y, z));
  return corners;
}

describe('ObserverCamera framing fit', () => {
  it.each([16 / 9, 4 / 3, 1, 0.6])('keeps every corner of the scene on screen and fills the view (aspect %f)', (aspect) => {
    const camera = new PerspectiveCamera(45, aspect, 0.1, 500);
    ObserverCamera.framing(camera, roadBounds);
    camera.updateProjectionMatrix();

    const projected = boundsCorners(roadBounds).map((c) => c.project(camera));
    for (const p of projected) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
    }
    const largest = Math.max(...projected.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
    expect(largest).toBeGreaterThanOrEqual(0.6);
  });
});

describe('ObserverCamera Reset View', () => {
  it('restores the starting position and view direction after orbit, tilt, pan, and zoom', () => {
    const { camera, observer } = makeObserver();
    const startPosition = camera.position.clone();
    const startDirection = camera.getWorldDirection(new Vector3());

    observer.orbit(0.8);
    observer.tilt(0.4);
    observer.pan(3, -2);
    observer.zoom(0.5);
    expect(camera.position.distanceTo(startPosition)).toBeGreaterThan(1);

    observer.resetView();

    expect(camera.position.distanceTo(startPosition)).toBeLessThan(1e-6);
    expect(camera.getWorldDirection(new Vector3()).angleTo(startDirection)).toBeLessThan(1e-6);
  });
});

describe('ObserverCamera pan', () => {
  it.each([0, 1.2, -2.5])('moves across the map in screen directions at constant height (after orbiting %f rad)', (orbit) => {
    const { camera, observer } = makeObserver();
    observer.orbit(orbit);
    const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const before = camera.position.clone();

    observer.pan(5, 0);

    const moved = camera.position.clone().sub(before);
    expect(moved.y).toBeCloseTo(0, 6);
    expect(moved.dot(screenRight)).toBeCloseTo(5, 6);
  });

  it('moves forward toward the top of the screen', () => {
    const { camera, observer } = makeObserver();
    const screenUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const before = camera.position.clone();

    observer.pan(0, 4);

    const moved = camera.position.clone().sub(before);
    expect(moved.y).toBeCloseTo(0, 6);
    expect(moved.dot(screenUp)).toBeGreaterThan(0);
    expect(moved.length()).toBeCloseTo(4, 6);
  });
});

describe('ObserverCamera limits', () => {
  it('tilts no further than fully overhead or a low angled view', () => {
    const { camera, observer } = makeObserver();

    observer.tilt(10);
    const steepest = degreesFromStraightDown(camera);
    expect(steepest).toBeLessThanOrEqual(75);
    expect(steepest).toBeGreaterThanOrEqual(60);

    observer.tilt(-10);
    expect(degreesFromStraightDown(camera)).toBeLessThan(1);
    expect(camera.position.y).toBeGreaterThan(roadBounds.max.y);
  });

  it('zooms between a close view and a whole-map view', () => {
    const { camera, observer } = makeObserver();
    const startDistance = camera.position.distanceTo(roadBounds.getCenter(new Vector3()));

    observer.zoom(0.0001);
    const closest = camera.position.distanceTo(roadBounds.getCenter(new Vector3()));
    expect(closest).toBeGreaterThan(1);

    observer.zoom(10000);
    const farthest = camera.position.distanceTo(roadBounds.getCenter(new Vector3()));
    expect(farthest).toBeLessThanOrEqual(startDistance * 4);
    expect(farthest).toBeGreaterThan(startDistance);
  });
});

describe('ObserverCamera drag to pan', () => {
  it('keeps the point in view under the pointer when dragging by screen pixels', () => {
    const { camera, observer } = makeObserver();
    const viewportHeight = 900;
    const viewportWidth = viewportHeight * camera.aspect;
    const pointInView = roadBounds.getCenter(new Vector3());
    const toPixels = (p: Vector3) => {
      const ndc = p.clone().project(camera);
      return { x: ((ndc.x + 1) / 2) * viewportWidth, y: ((1 - ndc.y) / 2) * viewportHeight };
    };
    const before = toPixels(pointInView);

    observer.dragPan(120, 0, viewportHeight);

    const after = toPixels(pointInView);
    expect(after.x - before.x).toBeCloseTo(120, 0);
    expect(after.y - before.y).toBeCloseTo(0, 0);
  });
});
