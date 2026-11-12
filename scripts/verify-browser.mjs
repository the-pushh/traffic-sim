// Browser check for the starter scene: loads the app in the installed Google Chrome,
// records console errors and asset requests, exercises the camera, and saves
// screenshots to artifacts/3d/previews/, then checks the asset-failure state and Retry.
// Usage: node scripts/verify-browser.mjs [url] [--headed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';
// The dev server honours ?timeScale=; a deployed build runs in real time, so allow a full run.
const isDevServer = /^http:\/\/(localhost|127\.0\.0\.1)/.test(url) && !url.includes(':4173');
const runEndTimeout = isDevServer ? 15000 : 45000;
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

// Run controls (T1). The dev server honours ?timeScale= so a 30 s run ends in ~2 s.
const runPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const runUrl = new URL(url);
runUrl.searchParams.set('timeScale', '15');
await runPage.goto(runUrl.href);
await runPage.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
const dockState = () => runPage.locator('.dock').getAttribute('data-state');
const clockText = () => runPage.locator('.clock').textContent();
const settingsDisabled = () =>
  runPage.evaluate(() => {
    const controls = [document.querySelector('.intensity input'), ...document.querySelectorAll('[data-duration]')];
    return controls.every((c) => c.disabled) && !document.querySelector('.lock-hint').hidden;
  });
const settingsEnabled = () =>
  runPage.evaluate(() => [document.querySelector('.intensity input'), ...document.querySelectorAll('[data-duration]')].every((c) => !c.disabled));
const runChecks = {};
let blockedAtEntries = null;
let hoverTag = null;
runChecks.noHeaderAndViewFillsWindow = await runPage.evaluate(() => {
  const view = document.querySelector('.viewport').getBoundingClientRect();
  return !document.querySelector('#app > header, body > header') && view.top === 0 && view.height === innerHeight && view.width === innerWidth;
});
runChecks.dockFloatsAtBottomCentre = await runPage.evaluate(() => {
  const dock = document.querySelector('.dock').getBoundingClientRect();
  return Math.abs(dock.left + dock.width / 2 - innerWidth / 2) < 2 && innerHeight - dock.bottom < 40 && getComputedStyle(document.querySelector('.dock')).borderTopLeftRadius !== '0px';
});
runChecks.sceneArrowsEnabledWhenReady = await runPage.evaluate(() => [...document.querySelectorAll('.pill-arrow')].every((a) => !a.disabled));
runChecks.pillShowsMainStreet = (await runPage.locator('.scene-name').textContent())?.trim() === 'Main Street';
runChecks.tipShownOnFirstVisit = await runPage.locator('.first-visit-tip').isVisible();
runChecks.readyClock = (await clockText()) === '0:00 / 0:30' && (await dockState()) === 'ready' && (await settingsEnabled());
await runPage.locator('.intensity input').fill('4');
runChecks.intensityChangeShowsLabel = (await runPage.locator('.intensity-name').textContent()) === 'Congested';
await runPage.locator('.intensity input').fill('2');
await runPage.locator('.dock').screenshot({ path: `${outDir}/11-dock-ready.png` });
await runPage.getByRole('button', { name: 'Play' }).click();
runChecks.playRunsAndLocksSettings = (await dockState()) === 'running' && (await settingsDisabled());
runChecks.sceneArrowsLockedDuringRun = await runPage
  .waitForFunction(() => [...document.querySelectorAll('.pill-arrow')].every((a) => a.disabled), null, { timeout: 2000 })
  .then(() => true, () => false);
runChecks.tipGoneAfterPlay = (await runPage.locator('.first-visit-tip').count()) === 0;
await runPage.waitForTimeout(300);
await runPage.getByRole('button', { name: 'Pause' }).click();
const pausedAt = await clockText();
await runPage.waitForTimeout(600);
runChecks.pauseHoldsClockAndKeepsLock = (await dockState()) === 'paused' && (await clockText()) === pausedAt && (await settingsDisabled());
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/12-dock-paused-locked.png` });
await runPage.getByRole('button', { name: 'Play' }).click();
await runPage.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: runEndTimeout });
runChecks.endsExactlyAtDuration = (await clockText()) === '0:30 / 0:30' && (await settingsEnabled());
// Results card (T7): appears on Ended, labelled with scene, intensity and duration, with absolute numbers.
runChecks.resultsCardOnEnd = await runPage.evaluate(() => {
  const card = document.querySelector('.results-card');
  if (!card || card.hidden) return false;
  const text = card.textContent ?? '';
  return text.includes('Main Street · Medium · 30 s') && /Trips due · entered · finished\s*\d+ · \d+ · \d+/.test(text) && text.includes('Peak queue') && text.includes('Junction 1 · eastbound');
});
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/16-results-first-run.png` });
await runPage.getByRole('button', { name: 'Close results' }).click();
runChecks.resultsCloseAndReopen =
  (await runPage.locator('.results-card').isHidden()) &&
  (await runPage.evaluate(() => document.activeElement?.textContent === 'Show results')) &&
  (await runPage.getByRole('button', { name: 'Show results' }).click().then(() => runPage.locator('.results-card').isVisible()));
await runPage.locator('.dock').screenshot({ path: `${outDir}/13-dock-ended.png` });
// Click Play and read the clock in the same task, so the check doesn't depend on timing.
runChecks.playAfterEndContinuesFromZero = await runPage.evaluate(() => {
  document.querySelector('[data-action="play-pause"]').click();
  return document.querySelector('.dock').dataset.state === 'running' && document.querySelector('.clock').textContent === '0:00 / 0:30';
});
await runPage.getByRole('button', { name: 'Restart run' }).click();
runChecks.restartReturnsToReady = (await dockState()) === 'ready' && (await clockText()) === '0:00 / 0:30' && (await settingsEnabled());
await runPage.getByRole('button', { name: '60 s' }).click();
runChecks.durationChangeShown = (await clockText()) === '0:00 / 1:00';
// A settings change after a run ends goes back to Ready (fresh start), not a half-full ended run.
await runPage.getByRole('button', { name: '30 s' }).click();
await runPage.getByRole('button', { name: 'Play' }).click();
await runPage.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: runEndTimeout });
runChecks.resultsShowPreviousRun = await runPage.evaluate(() => {
  const card = document.querySelector('.results-card');
  return !card.hidden && (card.textContent ?? '').includes('Previous run');
});
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/17-results-with-previous.png` });
await runPage.getByRole('button', { name: '60 s' }).click();
runChecks.resultsHiddenAfterFreshStart = await runPage
  .waitForFunction(() => document.querySelector('.results-card')?.hidden === true, null, { timeout: 2000 })
  .then(() => true, () => false);
runChecks.settingChangeAfterEndReturnsToReady = (await dockState()) === 'ready' && (await clockText()) === '0:00 / 1:00';
// Traffic (T3): play for a while, pause, check vehicles queue at the red light and the hover tag explains them.
if (isDevServer) {
  await runPage.getByRole('button', { name: 'Restart run' }).click();
  await runPage.getByRole('button', { name: 'Play' }).click();
  // Within one 30 s signal cycle (2 s here), some car must be waiting at the red light.
  const sawQueue = await runPage
    .waitForFunction(() => window.__trafficDebug.vehicles().some((v) => v.reason === 'Red light' || v.reason === 'Queued behind the car ahead'), null, { timeout: 4000, polling: 50 })
    .then(() => true, () => false);
  await runPage.getByRole('button', { name: 'Pause' }).click();
  await runPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const vehicles = await runPage.evaluate(() => window.__trafficDebug.vehicles());
  runChecks.trafficOnTheRoad = vehicles.length >= 1;
  runChecks.someQueuedOrStoppedAtRed = sawQueue;
  runChecks.liveQueueShownOnApproach = await runPage.evaluate(() => window.__trafficDebug.queues().some((q) => q.live > 0) && window.__trafficDebug.queueLabelsShown() > 0);
  const target = vehicles.find((v) => v.x > 100 && v.x < 1300 && v.y > 80 && v.y < 650);
  if (target) {
    await runPage.mouse.move(target.x, target.y);
    await runPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const tag = await runPage.locator('.vehicle-tooltip').textContent();
    runChecks.hoverTagShowsTypeProfileReason = /^[A-Z][A-Za-z ]+ · (Steady|Cautious|Assertive|Cooperative|Impatient) · .+$/.test(tag ?? '');
    hoverTag = tag;
  } else runChecks.hoverTagShowsTypeProfileReason = false;
  await runPage.screenshot({ path: `${outDir}/14-traffic-paused.png` });
  // Routing (T6): close the road in from the west edge; trips there have no way through and are counted as blocked.
  await runPage.evaluate(() => window.__trafficDebug.closePieces([0]));
  await runPage.getByRole('button', { name: 'Play' }).click();
  runChecks.blockedTripsCountedAtEntry = await runPage
    .waitForFunction(() => Object.values(window.__trafficDebug.blocked()).some((n) => n > 0) && window.__trafficDebug.counts().blocked > 0, null, { timeout: 8000, polling: 100 })
    .then(() => true, () => false);
  await runPage.getByRole('button', { name: 'Pause' }).click();
  blockedAtEntries = await runPage.evaluate(() => window.__trafficDebug.blocked());
  await runPage.screenshot({ path: `${outDir}/15-blocked-entry.png` });
  await runPage.getByRole('button', { name: 'Restart run' }).click();
}
await runPage.reload();
await runPage.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
runChecks.tipRememberedAfterReload = (await runPage.locator('.first-visit-tip').count()) === 0;
await runPage.close();

// Scene carousel and store (T11): cycle all five scenes, then Save / Reset / the leave dialog.
const carouselChecks = {};
if (isDevServer) {
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page2.goto(url);
  await page2.evaluate(() => localStorage.clear());
  await page2.reload();
  const ready = () => page2.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  const sceneName = async () => (await page2.locator('.scene-name').textContent())?.trim();
  await ready();
  const names = [await sceneName()];
  const warmedUp = [(await page2.evaluate(() => window.__trafficDebug.vehicles().length)) > 0];
  for (let i = 0; i < 5; i++) {
    await page2.getByRole('button', { name: 'Next scene' }).click();
    await ready();
    names.push(await sceneName());
    warmedUp.push((await page2.evaluate(() => window.__trafficDebug.vehicles().length)) > 0);
  }
  // Every preset opens with warm-up traffic; the blank board (5th) has none until joined up.
  carouselChecks.presetsOpenWithWarmUpTraffic = JSON.stringify(warmedUp) === JSON.stringify([true, true, true, true, false, true]);
  carouselChecks.focusStaysOnArrow = await page2.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Next scene');
  carouselChecks.cyclesAllFiveScenes = JSON.stringify(names) === JSON.stringify(['Main Street', 'Market Roundabout', 'School Run', 'Flyover Bottleneck', 'Blank board', 'Main Street']);
  await page2.getByRole('button', { name: 'Previous scene' }).click();
  await ready();
  carouselChecks.previousGoesBack = (await sceneName()) === 'Blank board';
  carouselChecks.opensReady = (await page2.locator('.dock').getAttribute('data-state')) === 'ready';
  await page2.screenshot({ path: `${outDir}/21-blank-board.png` });
  await page2.getByRole('button', { name: 'Next scene' }).click();
  await ready();
  carouselChecks.saveHiddenWithoutEdits = await page2.getByRole('button', { name: 'Save', exact: true }).isHidden();
  await page2.evaluate(() => window.__trafficDebug.editScene());
  await page2.waitForTimeout(100);
  carouselChecks.saveAndResetShowWithEdits = (await page2.getByRole('button', { name: 'Save', exact: true }).isVisible()) && (await page2.getByRole('button', { name: 'Reset', exact: true }).isVisible());
  await page2.getByRole('button', { name: 'Next scene' }).click();
  const dialog = page2.locator('dialog.leave-dialog');
  carouselChecks.leaveAsksFirst = (await dialog.isVisible()) && (await dialog.textContent())?.includes('Leaving resets the road network to default.');
  await page2.screenshot({ path: `${outDir}/22-leave-dialog.png` });
  await page2.getByRole('button', { name: 'Cancel' }).click();
  carouselChecks.cancelStays = !(await dialog.isVisible()) && (await sceneName()) === 'Main Street';
  await page2.getByRole('button', { name: 'Next scene' }).click();
  await page2.getByRole('button', { name: 'Discard and switch' }).click();
  await ready();
  await page2.getByRole('button', { name: 'Previous scene' }).click();
  await ready();
  carouselChecks.discardDropsEdits = (await sceneName()) === 'Main Street' && (await page2.getByRole('button', { name: 'Reset', exact: true }).isHidden());
  // Edits are allowed while paused, and so is Save.
  await page2.getByRole('button', { name: 'Play' }).click();
  await page2.getByRole('button', { name: 'Pause' }).click();
  await page2.evaluate(() => window.__trafficDebug.editScene());
  carouselChecks.saveWorksWhilePaused = await page2
    .waitForFunction(() => { const b = [...document.querySelectorAll('.pill-action')].find((x) => x.textContent === 'Save'); return b && !b.hidden && !b.disabled; }, null, { timeout: 2000 })
    .then(() => true, () => false);
  await page2.getByRole('button', { name: 'Restart run' }).click();
  await page2.getByRole('button', { name: 'Next scene' }).click();
  await page2.getByRole('button', { name: 'Save and switch' }).click();
  await ready();
  carouselChecks.saveAndSwitch = (await sceneName()) === 'Market Roundabout';
  await page2.getByRole('button', { name: 'Previous scene' }).click();
  await ready();
  carouselChecks.savedVersionKept = (await page2.getByRole('button', { name: 'Reset', exact: true }).isVisible()) && (await page2.getByRole('button', { name: 'Save', exact: true }).isHidden());
  await page2.getByRole('button', { name: 'Reset', exact: true }).click();
  await ready();
  carouselChecks.resetRestoresDesign = await page2.getByRole('button', { name: 'Reset', exact: true }).isHidden();
  await page2.evaluate(() => localStorage.clear());
  await page2.close();
}

// Editor (T12): drag parts with a preview that matches the drop, invalid drops, Escape, undo/redo, selection, signal timing, paused edits.
const editorChecks = {};
if (isDevServer) {
  const page3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const editorErrors = [];
  page3.on('pageerror', (e) => editorErrors.push(String(e)));
  const editorUrl = new URL(url);
  editorUrl.searchParams.set('scene', 'blank-board');
  await page3.goto(editorUrl.toString());
  await page3.evaluate(() => localStorage.clear());
  await page3.reload();
  await page3.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  const pieces = () => page3.evaluate(() => window.__trafficDebug.scene().pieces.length);
  await page3.getByRole('button', { name: 'Parts' }).click();
  editorChecks.drawerGroupsParts = (await page3.locator('.parts-group').count()) === 6 && (await page3.locator('.parts-drawer').isVisible());
  /** Drag a part from the drawer to a board point; returns what the preview showed just before release. */
  const dragPart = async (part, x, z, { release = true, escape = false } = {}) => {
    const box = await page3.locator(`[data-part="${part}"]`).boundingBox();
    await page3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page3.mouse.down();
    const target = await page3.evaluate(([x, z]) => window.__trafficDebug.screenOf(x, z), [x, z]);
    for (let i = 1; i <= 8; i++) await page3.mouse.move(box.x + ((target.x - box.x) * i) / 8, box.y + ((target.y - box.y) * i) / 8);
    await page3.waitForTimeout(300);
    await page3.mouse.move(target.x + 1, target.y);
    await page3.waitForTimeout(80);
    const preview = await page3.evaluate(() => JSON.parse(JSON.stringify(window.__trafficDebug.preview())));
    const label = await page3.locator('.placement-reason').textContent();
    if (escape) await page3.keyboard.press('Escape');
    if (release) await page3.mouse.up();
    await page3.waitForTimeout(500);
    return { preview, label };
  };
  const startCount = await pieces();
  const valid = await dragPart('straight', 1.6, 8.6);
  await page3.screenshot({ path: `${outDir}/23-editor-dropped.png` });
  const placed = await page3.evaluate(() => window.__trafficDebug.scene().pieces.at(-1));
  editorChecks.previewMatchesDrop = valid.preview?.valid === true && JSON.stringify(valid.preview.placement) === JSON.stringify(placed) && (await pieces()) === startCount + 1;
  editorChecks.validPreviewSaysConnects = (valid.label ?? '').includes('Connects here');
  // A roundabout (3 × 3) centred on a corner tile would hang off the board.
  const invalid = await dragPart('roundabout', 0.6, 15.4);
  editorChecks.invalidDropExplainsAndChangesNothing = invalid.preview?.valid === false && (invalid.label ?? '').includes('Off the board') && (await pieces()) === startCount + 1;
  editorChecks.invalidReason = invalid.label;
  await dragPart('straight', 2.6, 8.6, { escape: true });
  editorChecks.escapeCancels = (await pieces()) === startCount + 1;
  await page3.getByRole('button', { name: 'Undo' }).click();
  await page3.waitForTimeout(400);
  editorChecks.undoRestores = (await pieces()) === startCount;
  await page3.getByRole('button', { name: 'Redo' }).click();
  await page3.waitForTimeout(400);
  editorChecks.redoReapplies = (await pieces()) === startCount + 1;
  // Keyboard placement: Enter on a part aims it at the middle; arrows move it; Enter drops.
  const beforeKeys = await pieces();
  await page3.locator('[data-part="crossroad"]').focus();
  await page3.keyboard.press('Enter');
  await page3.waitForTimeout(400);
  await page3.keyboard.press('ArrowUp');
  await page3.keyboard.press('ArrowUp');
  const keyPreview = await page3.evaluate(() => JSON.parse(JSON.stringify(window.__trafficDebug.preview())));
  await page3.locator('[data-part="crossroad"]').press('Enter');
  await page3.waitForTimeout(500);
  const keyPlaced = await page3.evaluate(() => window.__trafficDebug.scene().pieces.at(-1));
  editorChecks.keyboardPlacement = keyPreview?.valid === true && (await pieces()) === beforeKeys + 1 && JSON.stringify(keyPreview.placement) === JSON.stringify(keyPlaced);
  await page3.getByRole('button', { name: 'Undo' }).click();
  await page3.waitForTimeout(400);
  // Clicking a piece selects it: the inspector shows it and can remove it.
  const stub = await page3.evaluate(() => window.__trafficDebug.screenOf(1.5, 8.5));
  await page3.mouse.click(stub.x, stub.y);
  editorChecks.clickSelectsPiece = await page3.locator('.inspector').isVisible();
  await page3.locator('.inspector').getByRole('button', { name: 'Remove' }).click();
  await page3.waitForTimeout(400);
  editorChecks.removeFromInspector = (await pieces()) === startCount;

  // Main Street: retime a light from the inspector; edit while paused mid-run.
  await page3.getByRole('button', { name: 'Previous scene' }).click();
  await page3.getByRole('button', { name: 'Discard and switch' }).click().catch(() => {});
  await page3.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  while ((await page3.locator('.scene-name').textContent())?.trim() !== 'Main Street') {
    await page3.getByRole('button', { name: 'Next scene' }).click();
    await page3.getByRole('button', { name: 'Discard and switch' }).click({ timeout: 500 }).catch(() => {});
    await page3.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  }
  await page3.evaluate(() => window.__trafficDebug.select({ kind: 'control', index: 0 }));
  await page3.locator('[data-timing="green"]').fill('20');
  await page3.getByRole('button', { name: 'Apply timing' }).click();
  await page3.waitForTimeout(600);
  editorChecks.signalTimingChanges = (await page3.evaluate(() => window.__trafficDebug.scene().controls[0].timing.green)) === 20;
  await page3.screenshot({ path: `${outDir}/24-editor-signal.png` });
  // A stop sign dropped on a side street's approach to the first junction.
  const stopsBefore = await page3.evaluate(() => window.__trafficDebug.scene().controls.filter((c) => c.type === 'stop').length);
  await page3.evaluate(() => window.__trafficDebug.select(null));
  const stop = await dragPart('stop', 3.5, 9.1);
  editorChecks.controlPlacedOnApproach = stop.preview?.valid === true && (await page3.evaluate(() => window.__trafficDebug.scene().controls.filter((c) => c.type === 'stop').length)) === stopsBefore + 1;
  await page3.getByRole('button', { name: 'Play' }).click();
  await page3.waitForTimeout(1500);
  editorChecks.partsLockedWhileRunning = await page3.evaluate(() => [...document.querySelectorAll('[data-part]')].every((b) => b.disabled));
  await page3.getByRole('button', { name: 'Pause' }).click();
  editorChecks.partsUnlockedWhenPaused = await page3
    .waitForFunction(() => [...document.querySelectorAll('[data-part]')].every((b) => !b.disabled), null, { timeout: 2000 })
    .then(() => true, () => false);
  const before = await page3.evaluate(() => ({ time: window.__trafficDebug.counts(), vehicles: window.__trafficDebug.vehicles().length }));
  await page3.evaluate(() => window.__trafficDebug.editScene());
  await page3.waitForTimeout(800);
  const after = await page3.evaluate(() => ({ time: window.__trafficDebug.counts(), vehicles: window.__trafficDebug.vehicles().length, state: document.querySelector('.dock').dataset.state }));
  editorChecks.pausedEditKeepsRun = after.state === 'paused' && after.time.due === before.time.due && Math.abs(after.vehicles - before.vehicles) <= 1;
  editorChecks.noPageErrors = editorErrors.length === 0;
  editorChecks.errors = editorErrors.slice(0, 3);
  await page3.evaluate(() => localStorage.clear());
  await page3.close();
}

// Final verification (T13).
// Every preset runs: cycle the pill and play each one for a moment (works against the deployed app too).
const deployedChecks = {};
{
  const page4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page4.on('pageerror', (e) => pageErrors.push(String(e)));
  await page4.goto(url);
  await page4.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  const ran = {};
  for (let i = 0; i < 5; i++) {
    const name = (await page4.locator('.scene-name').textContent())?.trim();
    if (name !== 'Blank board') {
      await page4.getByRole('button', { name: 'Play' }).click();
      const moved = await page4
        .waitForFunction(() => !document.querySelector('.clock')?.textContent?.startsWith('0:00'), null, { timeout: 8000 })
        .then(() => true, () => false);
      await page4.getByRole('button', { name: 'Pause' }).click();
      await page4.getByRole('button', { name: 'Restart run' }).click();
      ran[name] = moved;
    }
    await page4.getByRole('button', { name: 'Next scene' }).click();
    await page4.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  }
  deployedChecks.presetsRan = ran;
  deployedChecks.allFourPresetsRun = Object.keys(ran).length === 4 && Object.values(ran).every(Boolean);
  deployedChecks.noPageErrors = pageErrors.length === 0;
  await page4.close();
}

const scenarioChecks = {};
if (isDevServer) {
  const page5 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors5 = [];
  page5.on('pageerror', (e) => errors5.push(String(e)));
  const fast = new URL(url);
  fast.searchParams.set('timeScale', '15');
  await page5.goto(fast.toString());
  await page5.evaluate(() => localStorage.clear());
  await page5.reload();
  await page5.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  const finishRun = () => page5.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: 30000 });
  const peaks = (column) =>
    page5.evaluate((column) => {
      const rows = [...document.querySelectorAll('.results-card tbody tr')].filter((r) => r.querySelector('th')?.textContent?.includes('·') && !r.querySelector('th')?.textContent?.includes('due'));
      return rows.map((r) => Number(r.querySelectorAll('td')[column]?.textContent ?? 'NaN'));
    }, column);
  // Before/after: run Main Street, shorten the first junction's arterial green, run again with the same traffic.
  await page5.getByRole('button', { name: 'Play' }).click();
  await finishRun();
  await page5.evaluate(() => window.__trafficDebug.select({ kind: 'control', index: 0 }));
  await page5.locator('[data-timing="green"]').fill('8');
  await page5.getByRole('button', { name: 'Apply timing' }).click();
  await page5.waitForTimeout(800);
  await page5.getByRole('button', { name: 'Play' }).click();
  await finishRun();
  await page5.waitForTimeout(200);
  const [after, before] = [await peaks(0), await peaks(1)];
  scenarioChecks.beforeAfterEditChangesQueues = before.length > 0 && JSON.stringify(after) !== JSON.stringify(before);
  scenarioChecks.beforeAfterResultsLabelled = ((await page5.locator('.results-card').textContent()) ?? '').includes('Previous run');
  await page5.locator('.bottom-stack').screenshot({ path: `${outDir}/25-before-after.png` });

  // A player's own scenario on the Blank board, built with the editor from the drawer, run to results.
  await page5.getByRole('button', { name: 'Previous scene' }).click();
  await page5.getByRole('button', { name: 'Discard and switch' }).click();
  await page5.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  scenarioChecks.onBlankBoard = (await page5.locator('.scene-name').textContent())?.trim() === 'Blank board';
  await page5.getByRole('button', { name: 'Parts' }).click();
  const drop = async (part, x, z) => {
    const box = await page5.locator(`[data-part="${part}"]`).boundingBox();
    await page5.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page5.mouse.down();
    const target = await page5.evaluate(([x, z]) => window.__trafficDebug.screenOf(x, z), [x, z]);
    for (let i = 1; i <= 6; i++) await page5.mouse.move(box.x + ((target.x - box.x) * i) / 6, box.y + ((target.y - box.y) * i) / 6);
    await page5.waitForTimeout(250);
    await page5.mouse.move(target.x + 1, target.y);
    const preview = await page5.evaluate(() => window.__trafficDebug.preview()?.valid === true);
    await page5.mouse.up();
    await page5.waitForTimeout(350);
    return preview;
  };
  const drops = [];
  // West to east along row 8, with a crossroads in the middle.
  for (let x = 1; x <= 14; x++) drops.push(await drop(x === 8 ? 'crossroad' : 'straight', x + 0.5, 8.5));
  // North and south to the crossroads (straights turned a quarter).
  await page5.keyboard.press('r');
  for (let z = 1; z <= 7; z++) drops.push(await drop('straight', 8.5, z + 0.5));
  for (let z = 9; z <= 14; z++) drops.push(await drop('straight', 8.5, z + 0.5));
  await page5.keyboard.press('r');
  await page5.keyboard.press('r');
  await page5.keyboard.press('r');
  // A traffic light on each approach to the crossroads.
  for (const [x, z] of [[8.5, 8.05], [8.95, 8.5], [8.5, 8.95], [8.05, 8.5]]) drops.push(await drop('signal', x, z));
  scenarioChecks.everyDropValid = drops.every(Boolean);
  scenarioChecks.dropsMade = drops.length;
  const built = await page5.evaluate(() => ({ pieces: window.__trafficDebug.scene().pieces.length, controls: window.__trafficDebug.scene().controls.length }));
  scenarioChecks.networkBuilt = built.pieces === 4 + 27 && built.controls === 4;
  await page5.screenshot({ path: `${outDir}/26-blank-board-built.png` });
  await page5.getByRole('button', { name: '90 s' }).click();
  await page5.getByRole('button', { name: 'Play' }).click();
  await page5.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: 60000 });
  await page5.waitForTimeout(200);
  const resultsText = (await page5.locator('.results-card').textContent()) ?? '';
  const tripsCell = await page5.evaluate(() => {
    const row = [...document.querySelectorAll('.results-card tr')].find((r) => r.querySelector('th')?.textContent?.includes('Trips due'));
    return row?.querySelector('td')?.textContent ?? '';
  });
  const finished = Number(tripsCell.split('·')[2] ?? 0);
  scenarioChecks.tripsDueEnteredFinished = tripsCell.trim();
  scenarioChecks.scenarioRunsToResults = resultsText.includes('Blank board') && finished > 0;
  scenarioChecks.finishedTrips = finished;
  await page5.screenshot({ path: `${outDir}/27-blank-board-results.png` });
  await page5.getByRole('button', { name: 'Save', exact: true }).click();
  scenarioChecks.scenarioSaved = await page5
    .getByRole('button', { name: 'Save', exact: true })
    .waitFor({ state: 'hidden', timeout: 5000 })
    .then(() => page5.evaluate(() => Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('Blank board'))), () => false);
  scenarioChecks.noPageErrors = errors5.length === 0;
  scenarioChecks.errors = errors5.slice(0, 3);
  await page5.evaluate(() => localStorage.clear());
  await page5.close();
}

// Presets (T8+): open each other preset on the dev server (?scene=), check it loads, has traffic and queues, and screenshot it.
const presetChecks = {};
if (isDevServer) {
  // Presets other than Main Street (src/scenes/presets.ts); add each new preset here as it lands.
  for (const [id, name] of [['market-roundabout', 'Market Roundabout'], ['school-run', 'School Run'], ['flyover-bottleneck', 'Flyover Bottleneck']]) {
    const presetPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const presetUrl = new URL(url);
    presetUrl.searchParams.set('scene', id);
    presetUrl.searchParams.set('timeScale', '15');
    const failed = [];
    presetPage.on('response', (r) => r.status() >= 400 && failed.push(r.url()));
    presetPage.on('pageerror', (e) => failed.push(String(e)));
    await presetPage.goto(presetUrl.toString());
    await presetPage.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
    await presetPage.getByRole('button', { name: 'Play' }).click();
    const queued = await presetPage
      .waitForFunction(() => window.__trafficDebug.queues().some((q) => q.live > 0), null, { timeout: 6000, polling: 100 })
      .then(() => true, () => false);
    await presetPage.getByRole('button', { name: 'Pause' }).click();
    await presetPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    presetChecks[id] = {
      pill: (await presetPage.locator('.scene-name').textContent())?.trim() === name,
      noFailedRequests: failed.length === 0,
      traffic: (await presetPage.evaluate(() => window.__trafficDebug.vehicles().length)) > 0,
      queueAtApproach: queued,
    };
    const target = (await presetPage.evaluate(() => window.__trafficDebug.vehicles())).find((v) => v.x > 100 && v.x < 1300 && v.y > 80 && v.y < 650);
    if (target) {
      await presetPage.mouse.move(target.x, target.y);
      await presetPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    const tag = target ? await presetPage.locator('.vehicle-tooltip').textContent() : null;
    presetChecks[id].hoverShowsReason = /^[A-Z][A-Za-z ]+ · (Steady|Cautious|Assertive|Cooperative|Impatient) · .+$/.test(tag ?? '');
    presetChecks[id].hoverTag = tag;
    await presetPage.screenshot({ path: `${outDir}/20-${id}.png` });
    await presetPage.close();
  }
}

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
  runChecks,
  hoverTag: hoverTag,
  presetChecks,
  carouselChecks,
  editorChecks,
  deployedChecks,
  scenarioChecks,
  blockedAtEntries,
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
  retryRecovered &&
  Object.values(runChecks).every(Boolean);
process.exit(ok ? 0 : 1);
