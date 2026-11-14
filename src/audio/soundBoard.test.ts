import { describe, expect, it } from 'vitest';
import { type AudioOutput, createSoundBoard, type Effect } from './soundBoard';

/** A stand-in for the speakers that writes down what it was asked to do. */
function fakeOutput() {
  const calls: string[] = [];
  const output: AudioOutput = {
    effect: (kind: Effect) => calls.push(`effect:${kind}`),
    ambience: (on: boolean) => calls.push(`ambience:${on ? 'in' : 'out'}`),
    silence: () => calls.push('silence'),
  };
  return { output, calls };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { get: (key: string) => values.get(key) ?? null, set: (key: string, value: string) => void values.set(key, value), values };
}

describe('sound', () => {
  it('starts muted on a first visit: edits and traffic make no sound', () => {
    const { output, calls } = fakeOutput();
    const board = createSoundBoard(() => output, memoryStorage());
    expect(board.enabled).toBe(false);
    board.play('place');
    board.setTrafficMoving(true);
    expect(calls).toEqual([]);
  });

  it('remembers the player’s choice for the next visit', () => {
    const storage = memoryStorage();
    createSoundBoard(() => fakeOutput().output, storage).setEnabled(true);
    expect(createSoundBoard(() => fakeOutput().output, storage).enabled).toBe(true);
  });

  it('plays each edit’s sound once when sound is on', () => {
    const { output, calls } = fakeOutput();
    const board = createSoundBoard(() => output, memoryStorage({ 'traffic-sim:sound': 'on' }));
    board.play('place');
    board.play('rotate');
    board.play('remove');
    expect(calls).toEqual(['effect:place', 'effect:rotate', 'effect:remove']);
  });

  it('fades one ambience layer in while traffic moves and out when it stops, without repeating', () => {
    const { output, calls } = fakeOutput();
    const board = createSoundBoard(() => output, memoryStorage({ 'traffic-sim:sound': 'on' }));
    board.setTrafficMoving(true);
    board.setTrafficMoving(true);
    board.setTrafficMoving(false);
    board.setTrafficMoving(false);
    expect(calls).toEqual(['ambience:in', 'ambience:out']);
  });

  it('turning sound off silences everything at once; on again mid-run brings the ambience back', () => {
    const { output, calls } = fakeOutput();
    const board = createSoundBoard(() => output, memoryStorage({ 'traffic-sim:sound': 'on' }));
    board.setTrafficMoving(true);
    board.setEnabled(false);
    board.play('remove');
    expect(calls).toEqual(['ambience:in', 'silence']);
    board.setEnabled(true);
    expect(calls.at(-1)).toBe('ambience:in');
  });
});
