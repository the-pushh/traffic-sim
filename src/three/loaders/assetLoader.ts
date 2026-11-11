import { type Group, type Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  const textureLoader = new TextureLoader();

  async function load<T>(url: string, fetchAsset: (fullUrl: string) => Promise<T>): Promise<T> {
    try {
      return await fetchAsset(baseUrl + url);
    } catch (cause) {
      throw new AssetLoadError(url, cause);
    }
  }

  return {
    model: (url: string): Promise<Group> => load(url, async (u) => (await gltfLoader.loadAsync(u)).scene),
    texture: (url: string): Promise<Texture> => load(url, (u) => textureLoader.loadAsync(u)),
  };
}
