export type DragGesture = 'pan' | 'orbit';

/**
 * Which camera gesture a pointer drag starts over the viewport. A plain primary drag turns
 * the view (orbit and tilt), unless it starts on the selected road piece: that drag is the
 * editor's, and moves the piece. Space+drag pans; right-drag also turns the view.
 */
export function dragGesture({ button, spaceHeld, onSelection }: { button: number; spaceHeld: boolean; onSelection: boolean }): DragGesture | null {
  if (button === 0) return spaceHeld ? 'pan' : onSelection ? null : 'orbit';
  if (button === 2) return 'orbit';
  return null;
}

/**
 * Whether the map consumes a Space key event (no page scroll, no press of the focused
 * button). True while the pointer is over the map, or once a pan happened during the
 * current hold; otherwise Space keeps its usual meaning. Text fields always get Space.
 */
export function mapClaimsSpace({
  pointerOverViewport,
  typingInTextField,
  pannedDuringHold,
}: {
  pointerOverViewport: boolean;
  typingInTextField: boolean;
  pannedDuringHold: boolean;
}): boolean {
  if (typingInTextField) return false;
  return pointerOverViewport || pannedDuringHold;
}
