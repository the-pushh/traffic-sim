import { type Camera, type Object3D, Raycaster, Vector2 } from 'three';

/** Which vehicle (if any) is under a point on screen, given in normalised device coordinates. */
export function createVehiclePicker(traffic: Object3D) {
  const raycaster = new Raycaster();
  return (camera: Camera, ndc: { x: number; y: number }): number | undefined => {
    raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObject(traffic, true).find((h) => h.object.userData.vehicleId !== undefined);
    return hit?.object.userData.vehicleId as number | undefined;
  };
}
