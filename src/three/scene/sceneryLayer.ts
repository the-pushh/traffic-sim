import { Group, InstancedMesh, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../../scenes/board';
import { NATURE_SCALE, type SceneryItem } from '../../scenes/scenery';

/**
 * Draws a scene's scenery (trees, bushes, grass, rocks, flowers) as one instanced mesh per
 * part of each model, so a board full of trees costs a few dozen draw calls, not hundreds.
 * Decoration only: the simulation and the editor ignore it.
 */
export function createSceneryLayer(items: readonly SceneryItem[], models: ReadonlyMap<string, Object3D>): Group {
  const layer = new Group();
  layer.name = 'scenery';
  const byModel = new Map<string, SceneryItem[]>();
  for (const item of items) byModel.set(item.model, [...(byModel.get(item.model) ?? []), item]);

  const place = new Matrix4();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const [name, placed] of byModel) {
    const model = models.get(name);
    if (!model) continue;
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const instances = new InstancedMesh(mesh.geometry, mesh.material, placed.length);
      placed.forEach((item, i) => {
        const size = NATURE_SCALE * TILE_SIZE * item.scale;
        place.compose(new Vector3(...boardToWorld([item.at[0], 0, item.at[1]])), turn.setFromAxisAngle(up, item.rotation), new Vector3(size, size, size));
        instances.setMatrixAt(i, place.multiply(mesh.matrixWorld));
      });
      // Only trees cast shadows: low plants and rocks barely show one, and each caster is drawn again for the shadow map.
      instances.castShadow = placed[0].kind === 'tree';
      instances.receiveShadow = true;
      instances.computeBoundingSphere();
      layer.add(instances);
    });
  }
  return layer;
}
