import type { PerspectiveCamera } from 'three';

/**
 * Size the camera to the viewport and centre the view in the area above the floating
 * panels: render the bottom `height` pixels of a virtual view `covered` pixels taller.
 * `setViewOffset` also sets the camera's aspect to the virtual view's ratio, which keeps
 * shapes undistorted; don't set `aspect` afterwards. Returns the covered fraction of
 * the screen height, for `ObserverCamera.framing`.
 */
export function fitCameraToViewport(
  camera: PerspectiveCamera,
  { width, height, covered }: { width: number; height: number; covered: number },
): number {
  const h = Math.max(height, 1);
  camera.setViewOffset(width, h + covered, 0, covered, width, h);
  camera.updateProjectionMatrix();
  return covered / h;
}
