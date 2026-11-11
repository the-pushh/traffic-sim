import { describe, expect, it } from 'vitest';
import { dragGesture, mapClaimsSpace } from './dragGesture';

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

describe('viewport drag gestures', () => {
  it('pans when Space is held while dragging with the primary button or trackpad', () => {
    expect(dragGesture({ button: LEFT, spaceHeld: true })).toBe('pan');
  });

  it('leaves a plain primary drag free for editing road pieces', () => {
    expect(dragGesture({ button: LEFT, spaceHeld: false })).toBeNull();
  });

  it('keeps right-drag as an optional orbit and tilt shortcut', () => {
    expect(dragGesture({ button: RIGHT, spaceHeld: false })).toBe('orbit');
  });

  it('starts no camera gesture from other buttons', () => {
    expect(dragGesture({ button: MIDDLE, spaceHeld: false })).toBeNull();
  });
});

describe('Space as the pan key', () => {
  it('is claimed by the map while the pointer is over it, even if a camera control has focus', () => {
    expect(mapClaimsSpace({ pointerOverViewport: true, typingInTextField: false, pannedDuringHold: false })).toBe(true);
  });

  it('keeps its usual meaning when the pointer is elsewhere and no pan happened', () => {
    expect(mapClaimsSpace({ pointerOverViewport: false, typingInTextField: false, pannedDuringHold: false })).toBe(false);
  });

  it('is claimed once a pan happened during the hold, wherever the pointer ends up', () => {
    expect(mapClaimsSpace({ pointerOverViewport: false, typingInTextField: false, pannedDuringHold: true })).toBe(true);
  });

  it('types a space in a text field', () => {
    expect(mapClaimsSpace({ pointerOverViewport: true, typingInTextField: true, pannedDuringHold: false })).toBe(false);
  });
});
