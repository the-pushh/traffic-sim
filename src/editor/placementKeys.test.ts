import { describe, expect, it } from 'vitest';
import { placementKeyAction } from './placementKeys';

const key = (k: string, extra: Partial<{ repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

describe('keys while placing a part', () => {
  it('turns the part a quarter with each Space press while it is being placed, by mouse or keyboard', () => {
    expect(placementKeyAction(key(' '), 'dragging')).toBe('rotate');
    expect(placementKeyAction(key(' '), 'keyboard')).toBe('rotate');
  });

  it('leaves Space alone otherwise, so it still pans the map', () => {
    expect(placementKeyAction(key(' '), 'idle')).toBeNull();
  });

  it('turns once per press: a held Space does not keep spinning the part', () => {
    expect(placementKeyAction(key(' ', { repeat: true }), 'dragging')).toBeNull();
  });

  it('drops a keyboard-placed part with Enter, and cancels any placement with Escape', () => {
    expect(placementKeyAction(key('Enter'), 'keyboard')).toBe('drop');
    expect(placementKeyAction(key('Enter'), 'dragging')).toBeNull(); // the pointer drops a dragged part
    expect(placementKeyAction(key('Escape'), 'dragging')).toBe('cancel');
    expect(placementKeyAction(key('Escape'), 'idle')).toBeNull();
  });

  it('turns the part with R too, but not when R is part of a shortcut', () => {
    expect(placementKeyAction(key('r'), 'dragging')).toBe('rotate');
    expect(placementKeyAction(key('R'), 'idle')).toBe('rotate'); // sets the turn for the next part
    expect(placementKeyAction(key('r', { metaKey: true }), 'dragging')).toBeNull();
    expect(placementKeyAction(key('r', { ctrlKey: true }), 'idle')).toBeNull();
    expect(placementKeyAction(key('r', { altKey: true }), 'dragging')).toBeNull();
  });
});
