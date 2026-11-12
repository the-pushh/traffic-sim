import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Texture } from 'three';
import { createTextureSharing } from './textureSharing';

/** A model as the kits ship them: one mesh whose material uses the kit's colour map. */
function kitModel(textureName = 'colormap') {
  const map = new Texture();
  map.name = textureName;
  const model = new Group();
  model.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map })));
  return model;
}
const mapOf = (model: Group) => ((model.children[0] as Mesh).material as MeshStandardMaterial).map;

describe('sharing kit textures between models', () => {
  it('gives every model from the same folder one copy of the colour map, so it is uploaded to the GPU once', () => {
    const share = createTextureSharing();
    const sedan = share(kitModel(), 'models/vehicles');
    const taxi = share(kitModel(), 'models/vehicles');
    expect(mapOf(taxi)).toBe(mapOf(sedan));
  });

  it('keeps different kits, and differently named textures, apart', () => {
    const share = createTextureSharing();
    const car = share(kitModel(), 'models/vehicles');
    const road = share(kitModel(), 'models/roads');
    const other = share(kitModel('signs'), 'models/vehicles');
    expect(mapOf(road)).not.toBe(mapOf(car));
    expect(mapOf(other)).not.toBe(mapOf(car));
  });

  it('keeps a texture apart when the model shifts or scales it differently', () => {
    const share = createTextureSharing();
    const plain = share(kitModel(), 'models/vehicles');
    const shifted = kitModel();
    mapOf(shifted)!.offset.set(0.5, 0);
    expect(mapOf(share(shifted, 'models/vehicles'))).not.toBe(mapOf(plain));
  });
});
