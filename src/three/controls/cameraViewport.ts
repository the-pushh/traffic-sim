import type { PerspectiveCamera } from 'three';

/**
 * Size the camera to the viewport and centre the view in the area the floating panels
 * leave clear: above the dock (`covered` px at the bottom) and left of a panel open on
 * the right (`coveredRight` px, the parts tray). Renders part of a larger virtual view.
 * `setViewOffset` also sets the camera's aspect to the virtual view's ratio, which keeps
 * shapes undistorted; don't set `aspect` afterwards. Returns the covered fraction of
 * the screen height, for `ObserverCamera.framing`.
 */
export function fitCameraToViewport(
  camera: PerspectiveCamera,
  { width, height, covered, coveredRight = 0 }: { width: number; height: number; covered: number; coveredRight?: number },
): number {
  const h = Math.max(height, 1);
  camera.setViewOffset(width + coveredRight, h + covered, coveredRight, covered, width, h);
  camera.updateProjectionMatrix();
  return covered / h;
}
