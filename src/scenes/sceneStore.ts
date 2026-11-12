import { type SceneDefinition, validateScene } from '../simulation/network/scene';

/** Where saved scenes live: browser storage in the app, memory in tests. */
export interface SceneStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Storage that lives only as long as the page (tests, or a browser that blocks storage). */
export function memoryStorage(): SceneStorage {
  const items = new Map<string, string>();
  return {
    get: (key) => items.get(key) ?? null,
    set: (key, value) => void items.set(key, value),
    remove: (key) => void items.delete(key),
  };
}

/** The browser's local storage, falling back to memory when it's blocked (private mode). */
export function browserStorage(): SceneStorage {
  try {
    const probe = 'traffic-sim:probe';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // Full or blocked: the scene stays as it is for this visit.
        }
      },
      remove: (key) => localStorage.removeItem(key),
    };
  } catch {
    return memoryStorage();
  }
}

const keyFor = (id: string) => `traffic-sim:scene:${id}`;
const same = (a: SceneDefinition, b: SceneDefinition) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The scenes the pill cycles through, each as the designer made it unless the player has
 * saved their own version in this browser, plus the player's unsaved edits to the scene
 * on screen.
 */
export class SceneStore {
  private index = 0;
  /** The scene on screen as last saved (or as designed), and with the player's edits. */
  private savedVersion: SceneDefinition;
  private working: SceneDefinition;

  constructor(
    private readonly designs: readonly SceneDefinition[],
    private readonly storage: SceneStorage,
    openWith = designs[0]?.id,
  ) {
    this.index = Math.max(0, designs.findIndex((d) => d.id === openWith));
    this.savedVersion = this.working = this.loadSaved(this.design());
  }

  /** The scene on screen, with any unsaved edits. */
  current(): SceneDefinition {
    return this.working;
  }

  /** Where the scene is in the cycle, for "2 of 5" style labels. */
  position() {
    return { index: this.index, count: this.designs.length };
  }

  /** Move to the next scene (wrapping round), dropping unsaved edits to this one. */
  next(): SceneDefinition {
    return this.open((this.index + 1) % this.designs.length);
  }

  /** Move to the previous scene (wrapping round), dropping unsaved edits to this one. */
  previous(): SceneDefinition {
    return this.open((this.index - 1 + this.designs.length) % this.designs.length);
  }

  /** Replace the scene on screen with the player's edited version (not saved yet). */
  edit(scene: SceneDefinition) {
    this.working = scene;
  }

  /** Whether the scene on screen has edits that haven't been saved. */
  isUnsaved() {
    return !same(this.working, this.savedVersion);
  }

  /** Whether the scene on screen (saved or not) differs from the designer's network. */
  differsFromDesign() {
    return !same(this.working, this.design());
  }

  /** Keep the scene on screen as this scene from now on, in this browser. */
  save() {
    this.storage.set(keyFor(this.working.id), JSON.stringify(this.working));
    this.savedVersion = this.working;
  }

  /** Go back to the designer's network, forgetting any saved version. */
  reset() {
    this.storage.remove(keyFor(this.design().id));
    this.savedVersion = this.working = this.design();
  }

  private design() {
    return this.designs[this.index];
  }

  private open(index: number) {
    this.index = index;
    this.savedVersion = this.working = this.loadSaved(this.design());
    return this.working;
  }

  /** The saved version of a scene, if there is one that still loads; otherwise the design. */
  private loadSaved(design: SceneDefinition): SceneDefinition {
    const text = this.storage.get(keyFor(design.id));
    if (!text) return design;
    try {
      const saved = JSON.parse(text) as SceneDefinition;
      return saved.id === design.id && validateScene(saved).length === 0 ? saved : design;
    } catch {
      return design;
    }
  }
}
