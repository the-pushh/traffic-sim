import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { fitCameraToViewport } from './cameraViewport';

describe('camera viewport with floating panels', () => {
  it.each([
    { width: 1440, height: 900, covered: 140 },
    { width: 1024, height: 768, covered: 160 },
    { width: 800, height: 1000, covered: 140 },
  ])('keeps shapes undistorted on a $width × $height screen with $covered px of panels', ({ width, height, covered }) => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    fitCameraToViewport(camera, { width, height, covered });

    const toPixels = (p: Vector3) => {
      const ndc = p.clone().project(camera);
      return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
    };
    const centre = toPixels(new Vector3(0, 0, 0));
    const right = toPixels(new Vector3(1, 0, 0));
    const up = toPixels(new Vector3(0, 1, 0));
    // One world unit across and one world unit up span the same number of pixels.
    expect(right.x - centre.x).toBeCloseTo(centre.y - up.y, 6);
  });

  it('centres the view in the area above the panels', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    fitCameraToViewport(camera, { width: 1440, height: 900, covered: 140 });

    const ndc = new Vector3(0, 0, 0).project(camera);
    const pixelY = ((1 - ndc.y) / 2) * 900;
    expect(pixelY).toBeCloseTo((900 - 140) / 2, 6);
    expect(fitCameraToViewport(camera, { width: 1440, height: 900, covered: 140 })).toBeCloseTo(140 / 900, 9);
  });

  it('centres the view left of a panel open on the right (the parts tray), without distorting it', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    fitCameraToViewport(camera, { width: 1440, height: 900, covered: 140, coveredRight: 340 });

    const toPixels = (p: Vector3) => {
      const ndc = p.clone().project(camera);
      return { x: ((ndc.x + 1) / 2) * 1440, y: ((1 - ndc.y) / 2) * 900 };
    };
    const centre = toPixels(new Vector3(0, 0, 0));
    expect(centre.x).toBeCloseTo((1440 - 340) / 2, 6);
    expect(centre.y).toBeCloseTo((900 - 140) / 2, 6);
    const right = toPixels(new Vector3(1, 0, 0));
    const up = toPixels(new Vector3(0, 1, 0));
    expect(right.x - centre.x).toBeCloseTo(centre.y - up.y, 6);
  });
});
