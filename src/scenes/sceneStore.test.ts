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

  it('hides Save again when an edit is undone, and ignores the order fields were written in', () => {
    const store = new SceneStore([A, B], memoryStorage());
    store.edit(edited(A));
    store.edit({ ...A });
    expect(store.isUnsaved()).toBe(false);
    // The same scene with its fields in a different order is no edit.
    const reordered = { demand: A.demand, controls: A.controls, pieces: A.pieces.map((p) => ({ rotation: p.rotation, at: p.at, piece: p.piece })), name: A.name, id: A.id };
    store.edit(reordered as SceneDefinition);
    expect(store.isUnsaved()).toBe(false);
    expect(store.differsFromDesign()).toBe(false);
  });

  it('keeps each scene’s saved version to itself', () => {
    const storage = memoryStorage();
    const store = new SceneStore([A, B], storage);
    store.edit(edited(A));
    store.save();
    expect(store.next()).toEqual(B);
    expect(store.differsFromDesign()).toBe(false);
  });

  it('resets unsaved edits even when nothing was saved', () => {
    const store = new SceneStore([A, B], memoryStorage());
    store.edit(edited(A));
    store.reset();
    expect(store.current()).toEqual(A);
    expect(store.isUnsaved()).toBe(false);
  });

  it('says so when the browser won’t keep a save, and still counts the edits as unsaved', () => {
    const full = { ...memoryStorage(), set: () => false };
    const store = new SceneStore([A, B], full);
    store.edit(edited(A));
    expect(store.save()).toBe(false);
    expect(store.isUnsaved()).toBe(true);
  });
});

