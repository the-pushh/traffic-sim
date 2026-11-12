import { type SceneDefinition, validateScene } from '../simulation/network/scene';

/** Where saved scenes live: browser storage in the app, memory in tests. */
export interface SceneStorage {
  get(key: string): string | null;
  /** Whether it was kept (false when the browser's storage is full or blocked). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

/** Storage that lives only as long as the page (tests, or a browser that blocks storage). */
export function memoryStorage(): SceneStorage {
  const items = new Map<string, string>();
  return {
    get: (key) => items.get(key) ?? null,
    set: (key, value) => {
      items.set(key, value);
      return true;
    },
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
      get: (key) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          return false; // full or blocked
        }
      },
      remove: (key) => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Blocked: nothing was kept anyway.
        }
      },
    };
  } catch {
    return memoryStorage();
  }
}

const keyFor = (id: string) => `traffic-sim:scene:${id}`;
/** A scene as text with its fields in a fixed order, so the order an editor writes them in doesn't count as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

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
  /** Worked out when the scene changes, not on every look (the pill asks every frame). */
  private unsaved = false;
  private changedFromDesign = false;

  constructor(
    private readonly designs: readonly SceneDefinition[],
    private readonly storage: SceneStorage,
    openWith = designs[0]?.id,
  ) {
    this.index = Math.max(0, designs.findIndex((d) => d.id === openWith));
    this.savedVersion = this.working = this.loadSaved(this.design());
    this.compare();
  }

  /** The scene on screen, with any unsaved edits. */
  current(): SceneDefinition {
    return this.working;
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
    this.compare();
  }

  /** Whether the scene on screen has edits that haven't been saved. */
  isUnsaved() {
    return this.unsaved;
  }

  /** Whether the scene on screen (saved or not) differs from the designer's network. */
  differsFromDesign() {
    return this.changedFromDesign;
  }

  /** Keep the scene on screen as this scene from now on, in this browser; false if the browser wouldn't keep it. */
  save(): boolean {
    if (!this.storage.set(keyFor(this.working.id), JSON.stringify(this.working))) return false;
    this.savedVersion = this.working;
    this.compare();
    return true;
  }

  /** Go back to the designer's network, forgetting any saved version. */
  reset() {
    this.storage.remove(keyFor(this.design().id));
    this.savedVersion = this.working = this.design();
    this.compare();
  }

  private compare() {
    const working = canonical(this.working);
    this.unsaved = working !== canonical(this.savedVersion);
    this.changedFromDesign = working !== canonical(this.design());
  }

  private design() {
    return this.designs[this.index];
  }

  private open(index: number) {
    this.index = index;
    this.savedVersion = this.working = this.loadSaved(this.design());
    this.compare();
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
