import { describe, expect, it } from 'vitest';
import { dragGesture, mapClaimsSpace } from './dragGesture';

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

describe('viewport drag gestures', () => {
  it('pans when Space is held while dragging with the primary button or trackpad', () => {
    expect(dragGesture({ button: LEFT, spaceHeld: true, onSelection: false })).toBe('pan');
  });

  it('turns the view (orbit and tilt) on a plain drag, in place of the joystick', () => {
    expect(dragGesture({ button: LEFT, spaceHeld: false, onSelection: false })).toBe('orbit');
  });

  it('leaves a drag that starts on the selected road piece to the editor, which moves the piece', () => {
    expect(dragGesture({ button: LEFT, spaceHeld: false, onSelection: true })).toBeNull();
    expect(dragGesture({ button: LEFT, spaceHeld: true, onSelection: true })).toBe('pan'); // Space still pans
  });

  it('keeps right-drag as an orbit and tilt shortcut', () => {
    expect(dragGesture({ button: RIGHT, spaceHeld: false, onSelection: false })).toBe('orbit');
  });

  it('starts no camera gesture from other buttons', () => {
    expect(dragGesture({ button: MIDDLE, spaceHeld: false, onSelection: false })).toBeNull();
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
