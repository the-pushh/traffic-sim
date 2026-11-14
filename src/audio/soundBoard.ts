/** The edits that make a sound: a road placed (click), a turn committed (tick), a road removed (tap). */
export type Effect = 'place' | 'rotate' | 'remove';

/** Where sound goes: the browser's audio, or a stand-in in tests. */
export interface AudioOutput {
  /** Play one effect now. */
  effect(kind: Effect): void;
  /** Fade the one traffic ambience layer in (true) or out (false). */
  ambience(on: boolean): void;
  /** Stop every sound at once (the player turned sound off). */
  silence(): void;
}

/** Where the player's choice is remembered between visits (localStorage in the app). */
export interface PreferenceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const PREFERENCE_KEY = 'traffic-sim:sound';

/**
 * The app's sound: off until the player turns it on (then remembered), one sound per
 * successful edit, and a single low traffic ambience while vehicles are moving. The output is
 * only created once sound is first needed, so a muted visit never starts the browser's audio.
 */
export function createSoundBoard(makeOutput: () => AudioOutput, storage: PreferenceStore) {
  let output: AudioOutput | null = null;
  const speakers = () => (output ??= makeOutput());
  let enabled = storage.get(PREFERENCE_KEY) === 'on';
  let trafficMoving = false;
  /** Whether the ambience is fading in or playing (what the output was last told). */
  let ambienceOn = false;
  /** What was played, newest last (for checks and the dev hook). */
  const log: string[] = [];

  function syncAmbience() {
    const wanted = enabled && trafficMoving;
    if (wanted === ambienceOn) return;
    ambienceOn = wanted;
    speakers().ambience(wanted);
    log.push(`ambience:${wanted ? 'in' : 'out'}`);
  }

  return {
    get enabled() {
      return enabled;
    },
    get ambience() {
      return ambienceOn;
    },
    log,
    /** A successful edit's sound; nothing when sound is off. */
    play(kind: Effect) {
      if (!enabled) return;
      speakers().effect(kind);
      log.push(`effect:${kind}`);
    },
    /** Whether traffic is running with vehicles on the move (call every frame; it only acts on changes). */
    setTrafficMoving(moving: boolean) {
      trafficMoving = moving;
      syncAmbience();
    },
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      storage.set(PREFERENCE_KEY, on ? 'on' : 'off');
      if (on) return syncAmbience();
      ambienceOn = false;
      output?.silence();
      log.push('silence');
    },
  };
}

export type SoundBoard = ReturnType<typeof createSoundBoard>;
