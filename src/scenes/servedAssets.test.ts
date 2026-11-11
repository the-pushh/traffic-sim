import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PIECES } from '../simulation/network/pieces';
import { CONTROL_MODELS } from '../three/scene/controlModels';
import { placeholderVehicle } from './vehicles';

const publicDir = join(import.meta.dirname, '../../public');

/** External image URIs that a .glb file asks the browser to fetch. */
function glbImageUris(file: string): string[] {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  return (gltf.images ?? []).flatMap((image: { uri?: string }) => (image.uri ? [image.uri] : []));
}

function expectServedWithTextures(url: string) {
  const file = join(publicDir, url);
  expect(existsSync(file), file).toBe(true);
  const uris = glbImageUris(file);
  expect(uris.length).toBeGreaterThan(0);
  for (const uri of uris) expect(existsSync(join(dirname(file), uri)), uri).toBe(true);
}

describe('served 3D assets', () => {
  it('serves the placeholder vehicle with its textures, at a relative URL', () => {
    expect(placeholderVehicle.url.startsWith('/')).toBe(false);
    expectServedWithTextures(placeholderVehicle.url);
  });

  it.each(Object.values(PIECES).map((p) => p.model))('serves the %s road piece with its textures', (model) => {
    expectServedWithTextures(`models/roads/${model}.glb`);
  });

  it.each(Object.values(CONTROL_MODELS))('serves the %s traffic-control model with its textures', (model) => {
    expectServedWithTextures(`models/roads/${model}.glb`);
  });
});
