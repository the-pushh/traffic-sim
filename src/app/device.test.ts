import { describe, expect, it } from 'vitest';
import { isHandheld } from './device';

describe('which devices get the app', () => {
  it('turns phones and tablets away: touch first, with no hover', () => {
    expect(isHandheld({ width: 390, coarsePointer: true, canHover: false })).toBe(true); // phone
    expect(isHandheld({ width: 1024, coarsePointer: true, canHover: false })).toBe(true); // tablet
    expect(isHandheld({ width: 1366, coarsePointer: true, canHover: false })).toBe(true); // large tablet, landscape
  });

  it('turns very narrow screens away whatever the pointer', () => {
    expect(isHandheld({ width: 600, coarsePointer: false, canHover: true })).toBe(true);
  });

  it('keeps laptops and desktops, including narrower windows and touchscreen laptops with a trackpad', () => {
    expect(isHandheld({ width: 1440, coarsePointer: false, canHover: true })).toBe(false);
    expect(isHandheld({ width: 800, coarsePointer: false, canHover: true })).toBe(false);
    expect(isHandheld({ width: 1280, coarsePointer: true, canHover: true })).toBe(false);
  });
});
