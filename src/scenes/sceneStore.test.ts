import { describe, expect, it } from 'vitest';
import type { SceneDefinition } from '../simulation/network/scene';
import { memoryStorage, SceneStore } from './sceneStore';

const preset = (id: string, name: string): SceneDefinition => ({
  id,
  name,
  pieces: [{ piece: 'straight', at: [0.5, 8.5], rotation: 0 }],
  controls: [],
  demand: { gateways: { A: 1 } },
});
const A = preset('a', 'Scene A');
const B = preset('b', 'Scene B');
const edited = (scene: SceneDefinition): SceneDefinition => ({ ...scene, pieces: [...scene.pieces, { piece: 'straight', at: [1.5, 8.5], rotation: 0 }] });

describe('scene store', () => {
  it('opens each scene as the designer made it, in order, cycling round both ways', () => {
    const store = new SceneStore([A, B], memoryStorage());
    expect(store.current().id).toBe('a');
    expect(store.next().id).toBe('b');
    expect(store.next().id).toBe('a');
    expect(store.previous().id).toBe('b');
    expect(store.isUnsaved()).toBe(false);
    expect(store.differsFromDesign()).toBe(false);
  });

  it('notices unsaved edits, and saving makes them the scene in this browser', () => {
    const storage = memoryStorage();
    const store = new SceneStore([A, B], storage);
    store.edit(edited(A));
    expect(store.isUnsaved()).toBe(true);
    expect(store.differsFromDesign()).toBe(true);
    store.save();
    expect(store.isUnsaved()).toBe(false);
    expect(store.differsFromDesign()).toBe(true);
    // A new visit (a fresh store on the same storage) opens the saved version.
    const later = new SceneStore([A, B], storage);
    expect(later.current().pieces).toHaveLength(2);
    expect(later.differsFromDesign()).toBe(true);
  });

  it('resets a scene to the designer’s network, forgetting the saved version', () => {
    const storage = memoryStorage();
    const store = new SceneStore([A, B], storage);
    store.edit(edited(A));
    store.save();
    store.reset();
    expect(store.current()).toEqual(A);
    expect(store.differsFromDesign()).toBe(false);
    expect(new SceneStore([A, B], storage).current()).toEqual(A);
  });

  it('drops unsaved edits when switching without saving, and keeps them when saving first', () => {
    const store = new SceneStore([A, B], memoryStorage());
    store.edit(edited(A));
    store.next(); // discard and switch
    expect(store.previous()).toEqual(A);
    store.edit(edited(A));
    store.save();
    store.next();
    expect(store.previous().pieces).toHaveLength(2);
  });

  it('ignores a saved version it can’t read, opening the designer’s network instead', () => {
    const storage = memoryStorage();
    storage.set('traffic-sim:scene:a', '{not json');
    expect(new SceneStore([A, B], storage).current()).toEqual(A);
  });
});
