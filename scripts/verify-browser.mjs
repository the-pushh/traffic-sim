// Browser check for the starter scene: loads the app in the installed Google Chrome,
// records console errors and asset requests, exercises the camera, and saves
// screenshots to artifacts/3d/previews/, then checks the asset-failure state and Retry.
// Usage: node scripts/verify-browser.mjs [url] [--headed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';
const outDir = 'artifacts/3d/previews';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: headed ? [] : ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const assetRequests = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => {
  const path = new URL(r.url()).pathname;
  if (/\.(glb|png)$/.test(path)) assetRequests.push(`${r.status()} ${path}`);
  if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${path}`);
});
// Failed asset requests count; a broken app module would already stop the scene from loading.
page.on('requestfailed', (r) => {
  if (/\.(glb|png)$/.test(new URL(r.url()).pathname)) assetRequests.push(`FAILED ${r.url()}`);
});

await page.goto(url);
await page.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await settle();

const canvas = await page.locator('canvas').boundingBox();
const controls = await page.locator('.camera-controls').boundingBox();
// Compare only the 3D scene, left of the camera controls, so control animations don't count as view changes.
const sceneClip = { x: canvas.x, y: canvas.y, width: controls.x - canvas.x - 8, height: canvas.height };

/** Saves a full-page screenshot and returns the scene-only pixels for comparison. */
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: `${outDir}/${name}.png` });
  return page.screenshot({ clip: sceneClip });
};
const cx = canvas.x + canvas.width / 2;
const cy = canvas.y + canvas.height / 2;

const initial = await shot('01-initial-overhead');
const drag = async (from, to, button = 'left') => {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down({ button });
  await page.mouse.move(to[0], to[1], { steps: 10 });
  await page.mouse.up({ button });
};

// A plain drag is reserved for editing road pieces: the camera must not move.
await drag([cx, cy], [cx + 200, cy + 80]);
const plainDrag = await shot('02-after-plain-drag');

// Hold Space and drag to pan.
await page.keyboard.down('Space');
await drag([cx, cy], [cx + 200, cy + 80]);
await page.keyboard.up('Space');
const panned = await shot('03-after-space-drag-pan');

// On-screen joystick: drag the knob toward the upper right and hold, then release.
const stick = await page.locator('.joystick').boundingBox();
const sx = stick.x + stick.width / 2;
const sy = stick.y + stick.height / 2;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + stick.width / 2, sy + stick.height / 2, { steps: 5 });
await page.waitForTimeout(500);
await page.mouse.up();
await page.waitForTimeout(400); // knob springs back over 120 ms; let in-flight frames land
const joystickDragged = await shot('04-after-joystick-orbit-tilt-angled');
await page.waitForTimeout(500);
const afterRelease = await shot('05-joystick-released');

// Keyboard on the focused joystick: hold the left arrow to orbit.
await page.locator('.joystick').focus();
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowLeft');
const keyboardJoystick = await shot('06-after-joystick-arrow-keys');

// Space + drag still pans while the joystick has focus (pointer over the map).
const spacePan = async () => {
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Space');
  await drag([cx, cy], [cx - 150, cy + 60]);
  await page.keyboard.up('Space');
};
await spacePan();
const panAfterJoystick = await shot('06b-space-pan-with-joystick-focused');
const joystickFocusedDuringPan = await page.evaluate(() => document.activeElement?.classList.contains('joystick'));

// Optional right-drag shortcut still orbits and tilts.
await drag([cx, cy], [cx - 120, cy - 60], 'right');
const rightDragged = await shot('07-after-right-drag');

// Scroll wheel zooms in.
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
const zoomed = await shot('08-after-wheel-zoom');

await page.getByRole('button', { name: 'Zoom in' }).click();
const zoomButton = await shot('08b-after-zoom-in-button');
await page.getByRole('button', { name: 'Reset View' }).click();
const reset = await shot('09-after-reset-view');

// Reset View keeps focus; Space + drag over the map must pan, and releasing Space must not press Reset View.
await spacePan();
const panAfterReset = await shot('09b-space-pan-with-reset-focused');
await page.waitForTimeout(200);
const afterSpaceRelease = await shot('09c-after-space-release');

const webglRenderer = await page.evaluate(() => {
  const gl = document.querySelector('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

// Asset-failure state: block the vehicle model, expect a named error with a focused Retry.
const failPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let blockVehicle = true;
await failPage.route('**/models/vehicles/sedan.glb', (route) => (blockVehicle ? route.abort() : route.continue()));
await failPage.goto(url);
await failPage.waitForSelector('.status.error', { timeout: 30000 });
const failureMessage = (await failPage.locator('.status.error p').textContent())?.trim();
const retryFocused = await failPage.evaluate(() => document.activeElement?.textContent === 'Retry');
const resetDisabledDuringFailure = await failPage.getByRole('button', { name: 'Reset View' }).isDisabled();
await failPage.screenshot({ path: `${outDir}/10-asset-failure.png` });
blockVehicle = false;
await failPage.getByRole('button', { name: 'Retry' }).click();
await failPage.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
const retryRecovered = await failPage.getByRole('button', { name: 'Reset View' }).isEnabled();
await browser.close();

const differs = (a, b) => !a.equals(b);
const result = {
  url,
  consoleErrors,
  assetRequests,
  plainDragLeftViewUnchanged: !differs(initial, plainDrag),
  spaceDragPanChangedView: differs(plainDrag, panned),
  joystickDragChangedView: differs(panned, joystickDragged),
  joystickStopsOnRelease: !differs(joystickDragged, afterRelease),
  joystickArrowKeysChangedView: differs(afterRelease, keyboardJoystick),
  spacePanWorksWithJoystickFocused: joystickFocusedDuringPan && differs(keyboardJoystick, panAfterJoystick),
  rightDragChangedView: differs(panAfterJoystick, rightDragged),
  zoomChangedView: differs(rightDragged, zoomed),
  zoomButtonChangedView: differs(zoomed, zoomButton),
  resetMatchesInitial: !differs(initial, reset),
  spacePanWorksWithButtonFocused: differs(reset, panAfterReset),
  spaceReleaseDidNotPressFocusedButton: !differs(panAfterReset, afterSpaceRelease) && differs(initial, afterSpaceRelease),
  headed,
  webglRenderer,
  failureMessage,
  retryFocused,
  resetDisabledDuringFailure,
  retryRecovered,
};
writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

const ok =
  consoleErrors.length === 0 &&
  !assetRequests.some((r) => !r.startsWith('200') && !r.startsWith('304')) &&
  result.plainDragLeftViewUnchanged &&
  result.spaceDragPanChangedView &&
  result.joystickDragChangedView &&
  result.joystickStopsOnRelease &&
  result.joystickArrowKeysChangedView &&
  result.spacePanWorksWithJoystickFocused &&
  result.rightDragChangedView &&
  result.zoomButtonChangedView &&
  result.spacePanWorksWithButtonFocused &&
  result.spaceReleaseDidNotPressFocusedButton &&
  result.zoomChangedView &&
  result.resetMatchesInitial &&
  failureMessage === "Couldn't load models/vehicles/sedan.glb" &&
  retryFocused &&
  resetDisabledDuringFailure &&
  retryRecovered;
process.exit(ok ? 0 : 1);
