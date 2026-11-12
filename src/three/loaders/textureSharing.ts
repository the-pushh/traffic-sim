import type { Material, Mesh, Object3D, Texture } from 'three';

/** Material slots that hold textures in the kits' models. */
const SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;

/**
 * Each Kenney kit shares one colour map between all its models, but every loaded model
 * gets its own copy (and its own GPU upload). Returns a function that points a model's
 * materials at the first copy of each texture from the same folder with the same name and
 * placement, so a kit's colour map is held once.
 */
export function createTextureSharing() {
  const shared = new Map<string, Texture>();
  // Everything that changes how the image is sampled: only identical settings share.
  const keyOf = (folder: string, t: Texture) =>
    [folder, t.name, t.offset.toArray(), t.repeat.toArray(), t.center.toArray(), t.rotation, t.channel, t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.flipY, t.colorSpace].join('|');

  return function share<T extends Object3D>(model: T, folder: string): T {
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat() as (Material & Record<string, unknown>)[]) {
        for (const slot of SLOTS) {
          const texture = material[slot] as Texture | null | undefined;
          if (!texture?.isTexture || !texture.name) continue;
          const key = keyOf(folder, texture);
          const first = shared.get(key);
          if (!first) shared.set(key, texture);
          else if (first !== texture) {
            material[slot] = first;
            texture.dispose();
          }
        }
      }
    });
    return model;
  };
}

/** The app's one sharing table: every loader's models share through it. */
export const shareKitTextures = createTextureSharing();
