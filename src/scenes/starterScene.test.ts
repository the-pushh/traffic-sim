import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { starterScene } from './starterScene';

const publicDir = join(import.meta.dirname, '../../public');

/** External image URIs that a .glb file asks the browser to fetch. */
function glbImageUris(file: string): string[] {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  return (gltf.images ?? []).flatMap((image: { uri?: string }) => (image.uri ? [image.uri] : []));
}

describe('starter scene assets', () => {
  const models = [starterScene.vehicle.url, starterScene.road.pieceUrl];

  it('uses a supplied vehicle, a supplied road piece, and a supplied road texture', () => {
    expect(starterScene.vehicle.url).toBe('models/vehicles/sedan.glb');
    expect(starterScene.road.pieceUrl).toBe('models/roads/road-straight.glb');
    expect(starterScene.road.surfaceTextureUrl).toBe('textures/roadTexture_01.png');
  });

  it.each(models)('serves %s with every texture it references', (url) => {
    const file = join(publicDir, url);
    expect(existsSync(file)).toBe(true);
    const uris = glbImageUris(file);
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris) expect(existsSync(join(dirname(file), uri)), uri).toBe(true);
  });

  it('serves the road surface texture', () => {
    expect(existsSync(join(publicDir, starterScene.road.surfaceTextureUrl))).toBe(true);
  });

  it('uses relative URLs so the app works under any deployment base path', () => {
    for (const url of [...models, starterScene.road.surfaceTextureUrl]) expect(url.startsWith('/')).toBe(false);
  });
});
