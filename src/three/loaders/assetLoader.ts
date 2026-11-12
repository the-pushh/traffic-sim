import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { shareKitTextures } from './textureSharing';

/** Thrown when a supplied asset cannot be loaded, naming the asset URL. */
export class AssetLoadError extends Error {
  constructor(
    readonly url: string,
    cause: unknown,
  ) {
    super(`Couldn't load ${url}`, { cause });
  }
}

/** Loads supplied assets by URL relative to the app's base path. */
export function createAssetLoader(baseUrl: string) {
  const gltfLoader = new GLTFLoader();

  async function load<T>(url: string, fetchAsset: (fullUrl: string) => Promise<T>): Promise<T> {
    try {
      return await fetchAsset(baseUrl + url);
    } catch (cause) {
      throw new AssetLoadError(url, cause);
    }
  }

  return {
    /** A model; its kit's textures are shared with the kit's other models (one GPU copy each). */
    model: (url: string): Promise<Group> => load(url, async (u) => shareKitTextures((await gltfLoader.loadAsync(u)).scene, url.slice(0, url.lastIndexOf('/')))),
  };
}
