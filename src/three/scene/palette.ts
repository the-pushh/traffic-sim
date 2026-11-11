import type { SignalAspect } from '../../simulation/traffic/signals';

/** Colours for objects in the 3D scene, kept separate from the interface tokens (design.md). */
export const SIGNAL_LAMP_COLOURS: Record<SignalAspect, string> = { red: '#d64545', amber: '#f2b63c', green: '#3fbf6a' };
/** Lamp height above the light's base, in world units: red on top, amber in the middle, green at the bottom. */
export const SIGNAL_LAMP_HEIGHTS: Record<SignalAspect, number> = { red: 2.45, amber: 2.15, green: 1.85 };
export const MISMATCH_COLOUR = SIGNAL_LAMP_COLOURS.red;
