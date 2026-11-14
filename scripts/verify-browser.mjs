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

/**
 * P20: the app opens on Flyover Bottleneck with 60 s runs. Checks written for Main Street and
 * 30 s runs move there first, with the scene arrows and the 30 s button, as a player would.
 */
async function toMainStreetAt30s(p) {
  for (let i = 0; i < 5 && (await p.locator('.scene-name').textContent())?.trim() !== 'Main Street'; i++) {
    await p.getByRole('button', { name: 'Next scene' }).click();
    await p.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  }
  if ((await p.locator('.scene-name').textContent())?.trim() !== 'Main Street') throw new Error('Couldn’t reach Main Street with the scene arrows');
  await chooseDuration(p, 30);
}

/** Pick a run length from the HUD's Duration menu (P25), as a player would. */
async function chooseDuration(p, seconds) {
  await p.getByRole('button', { name: /^Duration:/ }).click();
  await p.getByRole('option', { name: `${seconds} s` }).click();
}

/** The app starts zoomed in (P20); checks that drag to points across the board zoom out until it's all in view. */
async function wholeBoardInView(p) {
  for (let i = 0; i < 8; i++) {
    const allIn = await p.evaluate(() => {
      const debug = window.__trafficDebug;
      if (!debug) return null; // production: no hooks, so zoom out a fixed amount
      return [[0, 0], [16, 0], [0, 16], [16, 16]].every(([x, z]) => {
        const q = debug.screenOf(x, z);
        return q.x > 0 && q.y > 0 && q.x < innerWidth && q.y < innerHeight - 160;
      });
    });
    if (allIn === true || (allIn === null && i >= 3)) return;
    await p.getByRole('button', { name: 'Zoom out' }).click();
  }
  throw new Error('Couldn’t zoom out far enough to see the whole board');
}

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

// P20: a fresh visit opens on Flyover Bottleneck with a 60 s run.
const opensOnDefaults =
  (await page.locator('.scene-name').textContent())?.trim() === 'Flyover Bottleneck' &&
  (await page.getByRole('button', { name: 'Duration: 60 s' }).count()) === 1 &&
  (await page.locator('.countdown').textContent()) === '1:00 run';
const canvas = await page.locator('canvas').boundingBox();
const controls = await page.locator('.camera-controls').boundingBox();
// Compare only the 3D scene: left of the camera controls and above the bottom panels (the dock holds
// Reset View since P16), so a control's hover or focus doesn't count as a view change.
const panelsTop = (await page.locator('.bottom-stack').boundingBox()).y;
const sceneClip = { x: canvas.x, y: canvas.y, width: controls.x - canvas.x - 8, height: panelsTop - canvas.y - 8 };

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

// A plain drag on the map turns the view (P14: no joystick).
await drag([cx, cy], [cx + 200, cy + 80]);
const plainDrag = await shot('02-after-plain-drag-turns-view');

// Hold Space and drag to pan.
await page.keyboard.down('Space');
await drag([cx, cy], [cx + 200, cy + 80]);
await page.keyboard.up('Space');
const panned = await shot('03-after-space-drag-pan');

// Keyboard: focus the map and press the arrow keys to turn the view.
await page.locator('.viewport canvas').focus();
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowUp');
const keyboardTurned = await shot('04-after-arrow-keys-on-map');
const noJoystick = (await page.locator('.joystick').count()) === 0;
const mapFocusRing = await page.evaluate(() => {
  const canvas = document.querySelector('.viewport canvas');
  return document.activeElement === canvas && getComputedStyle(canvas).outlineStyle !== 'none';
});

// Space + drag still pans while the map has focus.
const spacePan = async () => {
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Space');
  await drag([cx, cy], [cx - 150, cy + 60]);
  await page.keyboard.up('Space');
};
await spacePan();
const panWithMapFocused = await shot('05-space-pan-with-map-focused');

// Optional right-drag shortcut still orbits and tilts.
await drag([cx, cy], [cx - 120, cy - 60], 'right');
const rightDragged = await shot('07-after-right-drag');

// Scroll wheel zooms in.
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
const zoomed = await shot('08-after-wheel-zoom');

await page.getByRole('button', { name: 'Zoom in' }).click();
const zoomButton = await shot('08b-after-zoom-in-button');
// No Reset View button any more: a camera button (Zoom in) keeps focus instead; Space + drag over the map
// must pan, and releasing Space must not press the focused button.
await page.getByRole('button', { name: 'Zoom in' }).focus();
const reset = await shot('09-zoom-in-focused');
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
await toMainStreetAt30s(runPage);
const dockState = () => runPage.locator('.dock').getAttribute('data-state');
const clockText = () => runPage.locator('.countdown').textContent();
/** Simulated seconds into the run, as the dock records it. */
const clockSeconds = () => runPage.evaluate(() => Number(document.querySelector('.dock').dataset.clock));
const settingsDisabled = () =>
  runPage.evaluate(() => {
    const controls = [document.querySelector('.intensity input'), document.querySelector('.duration-trigger')];
    // Disabled, with the reason for screen readers but not shown on screen (P22: the owner dropped the text).
    const hint = document.querySelector('.lock-hint');
    return controls.every((c) => c.disabled) && !hint.hidden && hint.getBoundingClientRect().width <= 1;
  });
const settingsEnabled = () =>
  runPage.evaluate(() => [document.querySelector('.intensity input'), document.querySelector('.duration-trigger')].every((c) => !c.disabled));
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
runChecks.readyClock = (await clockText()) === '0:30 run' && (await dockState()) === 'ready' && (await settingsEnabled());
await runPage.locator('.intensity input').fill('4');
runChecks.intensityChangeShowsLabel = (await runPage.locator('.intensity-name').textContent()) === 'Congested';
await runPage.locator('.intensity input').fill('2');
await runPage.locator('.dock').screenshot({ path: `${outDir}/11-dock-ready.png` });
await runPage.getByRole('button', { name: 'Play' }).click();
runChecks.playRunsAndLocksSettings = (await dockState()) === 'running' && (await settingsDisabled());
await runPage.waitForTimeout(400);
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/35-hud-running.png` });
runChecks.sceneArrowsLockedDuringRun = await runPage
  .waitForFunction(() => [...document.querySelectorAll('.pill-arrow')].every((a) => a.disabled), null, { timeout: 2000 })
  .then(() => true, () => false);
runChecks.tipGoneAfterPlay = (await runPage.locator('.first-visit-tip').count()) === 0;
await runPage.waitForTimeout(300);
await runPage.getByRole('button', { name: 'Pause' }).click();
const pausedAt = await clockSeconds();
const pausedRing = await runPage.evaluate(() => getComputedStyle(document.querySelector('.ring-fill')).strokeDashoffset);
await runPage.waitForTimeout(600);
runChecks.pauseHoldsClockAndKeepsLock = (await dockState()) === 'paused' && (await clockSeconds()) === pausedAt && (await settingsDisabled());
// P25: the countdown reads seconds left and the ring holds while paused.
runChecks.pausedCountdownAndRingHold =
  (await clockText()) === `${Math.ceil(30 - pausedAt)} s left` &&
  (await runPage.evaluate(() => getComputedStyle(document.querySelector('.ring-fill')).strokeDashoffset)) === pausedRing &&
  parseFloat(pausedRing) < 100;
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/12-dock-paused-locked.png` });
await runPage.getByRole('button', { name: 'Play' }).click();
await runPage.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: runEndTimeout });
runChecks.endsExactlyAtDuration = (await clockSeconds()) === 30 && (await clockText()) === 'Run complete' && (await settingsEnabled());
runChecks.ringFullAtEnd = await runPage.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ring-fill')).strokeDashoffset) === 0);
// Results card (T7): appears on Ended, labelled with scene, intensity and duration, with absolute numbers.
runChecks.resultsCardOnEnd = await runPage.evaluate(() => {
  const card = document.querySelector('.results-card');
  if (!card || card.hidden) return false;
  const text = card.textContent ?? '';
  return text.includes('Main Street · Medium · 30 s') && /Trips due · entered · finished\s*\d+ · \d+ · \d+/.test(text) && text.includes('Peak queue') && text.includes('Junction 1 · eastbound');
});
// Headlines first (P3): four big numbers show; the full table waits behind Show details.
runChecks.resultsHeadlinesFirst = await runPage.evaluate(() => {
  const labels = [...document.querySelectorAll('.results-headlines dt')].map((d) => d.textContent);
  return JSON.stringify(labels) === JSON.stringify(['Trips finished', 'Delay per trip', 'Longest queue', 'Blocked trips']) && document.querySelector('#results-details').hidden;
});
await runPage.locator('.top-stack').screenshot({ path: `${outDir}/16-results-first-run.png` });
const detailsToggle = runPage.locator('.results-details-toggle');
await detailsToggle.click();
runChecks.resultsDetailsToggle =
  (await detailsToggle.getAttribute('aria-expanded')) === 'true' &&
  (await runPage.locator('#results-details').isVisible()) &&
  (await detailsToggle.textContent()) === 'Hide details';
await runPage.locator('.top-stack').screenshot({ path: `${outDir}/16b-results-details.png` });
await detailsToggle.click();
runChecks.resultsDetailsToggle &&= (await runPage.locator('#results-details').isHidden()) && (await detailsToggle.getAttribute('aria-expanded')) === 'false';
// P22: the card sits at the top centre, and shrinks closed then grows open again.
runChecks.resultsAtTopCentre = await runPage.evaluate(() => {
  const r = document.querySelector('.results-card').getBoundingClientRect();
  return r.top < 40 && Math.abs(r.left + r.width / 2 - innerWidth / 2) < 4;
});
await runPage.getByRole('button', { name: 'Close results' }).click();
const shrinking = await runPage.evaluate(() => document.querySelector('.results-card').classList.contains('results-closing'));
runChecks.resultsCloseAndReopen =
  shrinking &&
  (await runPage.locator('.results-card').waitFor({ state: 'hidden', timeout: 2000 }).then(() => true, () => false)) &&
  (await runPage.waitForFunction(() => document.activeElement?.textContent === 'Show results', null, { timeout: 1000 }).then(() => true, () => false)) &&
  (await runPage.evaluate(() => {
    const b = document.querySelector('.results-reopen').getBoundingClientRect();
    return b.top < 60 && Math.abs(b.left + b.width / 2 - innerWidth / 2) < 4; // Show results at the top centre too
  })) &&
  (await runPage.getByRole('button', { name: 'Show results' }).click().then(() => runPage.locator('.results-card').isVisible())) &&
  (await runPage.waitForFunction(() => getComputedStyle(document.querySelector('.results-card')).opacity === '1', null, { timeout: 2000 }).then(() => true, () => false));
await runPage.locator('.dock').screenshot({ path: `${outDir}/13-dock-ended.png` });
// Click Play and read the clock in the same task, so the check doesn't depend on timing.
runChecks.playAfterEndContinuesFromZero = await runPage.evaluate(() => {
  document.querySelector('[data-action="play-pause"]').click();
  return document.querySelector('.dock').dataset.state === 'running' && document.querySelector('.dock').dataset.clock === '0';
});
await runPage.getByRole('button', { name: 'Reset run' }).click();
runChecks.restartReturnsToReady = (await dockState()) === 'ready' && (await clockText()) === '0:30 run' && (await settingsEnabled());
runChecks.ringEmptyAfterReset = await runPage.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ring-fill')).strokeDashoffset) === 100);
await runPage.mouse.move(5, 5);
await runPage.locator('.bottom-stack').screenshot({ path: `${outDir}/36-hud-reset.png` });
await chooseDuration(runPage, 60);
runChecks.durationChangeShown = (await clockText()) === '1:00 run';
// A settings change after a run ends goes back to Ready (fresh start), not a half-full ended run.
await chooseDuration(runPage, 30);
await runPage.getByRole('button', { name: 'Play' }).click();
await runPage.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: runEndTimeout });
runChecks.resultsShowPreviousRun = await runPage.evaluate(() => {
  const card = document.querySelector('.results-card');
  return !card.hidden && (card.textContent ?? '').includes('Previous run');
});
// Same scene twice: every headline says how it moved since the previous run.
runChecks.resultsHeadlinesCompare =
  (await runPage.locator('.results-headlines .change').count()) === 4 &&
  ((await runPage.locator('.results-caption').textContent()) ?? '').includes('compared with the previous run');
await runPage.locator('.top-stack').screenshot({ path: `${outDir}/17-results-with-previous.png` });
await chooseDuration(runPage, 60);
runChecks.resultsHiddenAfterFreshStart = await runPage
  .waitForFunction(() => document.querySelector('.results-card')?.hidden === true, null, { timeout: 2000 })
  .then(() => true, () => false);
// A run at another duration isn't compared: the caption says why, and no arrows show.
await runPage.getByRole('button', { name: 'Play' }).click();
await runPage.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: runEndTimeout * 2 });
runChecks.resultsNotComparedAcrossDurations =
  (await runPage.locator('.results-headlines .change').count()) === 0 &&
  ((await runPage.locator('.results-caption').textContent()) ?? '').includes('not compared: the previous run was Main Street · Medium · 30 s');
await runPage.getByRole('button', { name: 'Reset run' }).click();
runChecks.settingChangeAfterEndReturnsToReady = (await dockState()) === 'ready' && (await clockText()) === '1:00 run';
// Traffic (T3): play for a while, pause, check vehicles queue at the red light and the hover tag explains them.
if (isDevServer) {
  await runPage.getByRole('button', { name: 'Reset run' }).click();
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
  await runPage.getByRole('button', { name: 'Reset run' }).click();
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
  await toMainStreetAt30s(page2);
  // Warm-up traffic appears on the first frames after loading: allow a moment before calling a scene empty.
  const hasTraffic = () =>
    page2.waitForFunction(() => window.__trafficDebug.vehicles().length > 0, null, { timeout: 2000 }).then(() => true, () => false);
  const names = [await sceneName()];
  const warmedUp = [await hasTraffic()];
  // Width of the pill, and whether the name fits uncut (negative when it's cut short).
  const pillWidth = () =>
    page2.evaluate(() => {
      const name = document.querySelector('.scene-name');
      return name.scrollWidth <= name.clientWidth ? Math.round(document.querySelector('.scene-pill').getBoundingClientRect().width) : -1;
    });
  const widths = [await pillWidth()];
  for (let i = 0; i < 5; i++) {
    await page2.getByRole('button', { name: 'Next scene' }).click();
    await ready();
    names.push(await sceneName());
    widths.push(await pillWidth());
    warmedUp.push(await hasTraffic());
  }
  // Every preset opens with warm-up traffic; the blank board (5th) has none until joined up.
  // P23: the scene pill keeps one width whatever the scene's name.
  carouselChecks.pillWidthFixed = new Set(widths).size === 1 && widths[0] > 0; // one width, every name uncut
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
  await page2.getByRole('button', { name: 'Reset run' }).click();
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
  await chooseDuration(page3, 30); // the editor checks were written for 30 s runs
  await wholeBoardInView(page3);
  const pieces = () => page3.evaluate(() => window.__trafficDebug.scene().pieces.length);
  await page3.getByRole('button', { name: 'Customise' }).click();
  editorChecks.drawerGroupsParts = (await page3.locator('.parts-group').count()) === 6 && (await page3.locator('.parts-drawer').isVisible());
  /** Drag a part from the drawer to a board point; returns what the preview showed just before release. */
  const dragPart = async (part, x, z, { release = true, escape = false } = {}) => {
    const tile = page3.locator(`[data-part="${part}"]`);
    await tile.scrollIntoViewIfNeeded(); // the tray scrolls
    const box = await tile.boundingBox();
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
  // Space turns the part while it's dragged (P6), without panning the map; the first drag says so.
  {
    const tile = page3.locator('[data-part="bend"]');
    await tile.scrollIntoViewIfNeeded();
    const box = await tile.boundingBox();
    await page3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page3.mouse.down();
    const target = await page3.evaluate(() => window.__trafficDebug.screenOf(5.5, 3.5));
    for (let i = 1; i <= 8; i++) await page3.mouse.move(box.x + ((target.x - box.x) * i) / 8, box.y + ((target.y - box.y) * i) / 8);
    await page3.waitForTimeout(300);
    const turn = () => page3.evaluate(() => window.__trafficDebug.preview()?.placement?.rotation);
    const before = await turn();
    const tipOnFirstDrag = ((await page3.locator('.placement-tip').textContent()) ?? '').includes('Space');
    await page3.keyboard.press(' ');
    await page3.waitForTimeout(100);
    const after = await turn();
    const panning = await page3.evaluate(() => 'spaceHeld' in document.querySelector('canvas').dataset);
    await page3.keyboard.press('Escape');
    await page3.mouse.up();
    await page3.waitForTimeout(300);
    editorChecks.spaceTurnsWhileDragging = before !== undefined && after === (before + 90) % 360 && !panning;
    editorChecks.spaceTipFirstDragOnly = tipOnFirstDrag;
    // A second drag: no tip.
    await page3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page3.mouse.down();
    for (let i = 1; i <= 8; i++) await page3.mouse.move(box.x + ((target.x - box.x) * i) / 8, box.y + ((target.y - box.y) * i) / 8);
    await page3.waitForTimeout(300);
    editorChecks.spaceTipFirstDragOnly &&= (await page3.locator('.placement-tip').count()) === 0;
    // Turn back to the default for the drags below (Space pressed three more times = 360°).
    for (let i = 0; i < 3; i++) await page3.keyboard.press(' ');
    await page3.keyboard.press('Escape');
    await page3.mouse.up();
    await page3.waitForTimeout(300);
    // Space never gets stuck in pan mode: not when it starts a keyboard placement on a tile,
    // nor when it's held before a drag and released during it.
    const spaceStuck = () => page3.evaluate(() => 'spaceHeld' in document.querySelector('canvas').dataset);
    const centre = await page3.evaluate(() => window.__trafficDebug.screenOf(8, 8));
    await page3.mouse.move(centre.x, centre.y);
    await tile.focus();
    await page3.keyboard.press(' '); // starts keyboard placement
    await page3.waitForTimeout(200);
    const placingFromSpace = (await page3.evaluate(() => window.__trafficDebug.preview() !== null));
    await page3.keyboard.press('Escape');
    const stuckAfterKeyboardStart = await spaceStuck();
    await page3.keyboard.down(' ');
    await page3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page3.mouse.down();
    await page3.mouse.move(target.x, target.y, { steps: 6 });
    await page3.waitForTimeout(200);
    await page3.keyboard.up(' ');
    await page3.keyboard.press('Escape');
    await page3.mouse.up();
    await page3.waitForTimeout(200);
    editorChecks.spaceNeverStuck = placingFromSpace && !stuckAfterKeyboardStart && !(await spaceStuck());
  }
  // P24: straights dropped one after another below a north–south road end (at the default turn) line up
  // into one road, with no junctions; the dropped piece shows a rotate button on itself that turns it.
  {
    const before = await page3.evaluate(() => window.__trafficDebug.scene().pieces.length);
    for (const z of [1.6, 2.6, 3.6]) await dragPart('straight', 8.5, z);
    const placed = await page3.evaluate((n) => window.__trafficDebug.scene().pieces.slice(n), before);
    const lined = placed.length === 3 && placed.every((p, i) => p.piece === 'straight' && p.rotation % 180 === 90 && p.at[0] === 8.5 && p.at[1] === 1.5 + i);
    const button = page3.locator('.piece-rotate');
    const shown = await button.isVisible();
    await button.click();
    await page3.waitForTimeout(500);
    const turned = (await page3.evaluate(() => window.__trafficDebug.scene().pieces.at(-1).rotation)) % 180 === 0;
    editorChecks.straightsInSeriesStayStraight = lined;
    editorChecks.rotateButtonOnDroppedPiece = shown && turned;
    for (let i = 0; i < 4; i++) await page3.keyboard.press('Control+z'); // back to the empty board
    await page3.waitForTimeout(400);
    await page3.evaluate(() => window.__trafficDebug.select(null));
  }
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
  await page3.keyboard.press('Control+z'); // undo (the tray has no Undo button since the owner's header change)
  await page3.waitForTimeout(400);
  editorChecks.undoRestores = (await pieces()) === startCount;
  await page3.keyboard.press('Control+Shift+z'); // redo
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
  await page3.keyboard.press('Control+z'); // undo (the tray has no Undo button since the owner's header change)
  await page3.waitForTimeout(400);
  // Clicking a piece selects it: the inspector shows it and can remove it.
  const stub = await page3.evaluate(() => window.__trafficDebug.screenOf(1.5, 8.5));
  await page3.mouse.click(stub.x, stub.y);
  editorChecks.clickSelectsPiece = await page3.locator('.inspector:not(.vehicle-card)').isVisible();
  // P14: a drag that starts on the selected piece moves it (not the camera); a drag elsewhere turns the view and keeps the selection.
  {
    const placedAt = () => page3.evaluate(() => window.__trafficDebug.scene().pieces.at(-1).at.join(','));
    const before = await placedAt();
    const to = await page3.evaluate(() => window.__trafficDebug.screenOf(1.5, 10.5));
    await page3.mouse.move(stub.x, stub.y);
    await page3.mouse.down();
    await page3.mouse.move(to.x, to.y, { steps: 10 });
    await page3.waitForTimeout(200);
    // The drag became the editor's move (its preview is up) and the camera isn't being dragged.
    const movedPiece = await page3.evaluate(() => window.__trafficDebug.preview() !== null && !('dragging' in document.querySelector('canvas').dataset));
    await page3.keyboard.press('Escape'); // cancel the move
    await page3.mouse.up();
    await page3.waitForTimeout(400);
    await page3.mouse.click(stub.x, stub.y); // select it again
    const elsewhere = await page3.evaluate(() => window.__trafficDebug.screenOf(12.5, 3.5));
    // A board corner: the view turns about the board's middle, which stays put.
    const view = () => page3.evaluate(() => window.__trafficDebug.screenOf(0, 0));
    const viewBefore = await view();
    await page3.mouse.move(elsewhere.x, elsewhere.y);
    await page3.mouse.down();
    await page3.mouse.move(elsewhere.x + 120, elsewhere.y + 40, { steps: 8 });
    await page3.mouse.up();
    await page3.waitForTimeout(300);
    const viewAfter = await view();
    const turned = Math.hypot(viewAfter.x - viewBefore.x, viewAfter.y - viewBefore.y) > 5;
    const kept = (await placedAt()) === before;
    const stillSelected = await page3.locator('.inspector:not(.vehicle-card)').isVisible();
    editorChecks.dragOnSelectionMovesItElsewhereTurnsView = movedPiece && turned && kept && stillSelected;
    // Reselect the stub for the checks below (the view moved, so find it again).
    const again = await page3.evaluate(() => window.__trafficDebug.screenOf(1.5, 8.5));
    await page3.mouse.click(again.x, again.y);
  }
  await page3.locator('.inspector:not(.vehicle-card)').getByRole('button', { name: 'Remove' }).click();
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
  // A road dropped against the side of a two-way straight joins it as a T-junction (P10); undo restores it.
  {
    const target = await page3.evaluate(() => {
      const pieces = window.__trafficDebug.scene().pieces;
      const taken = (x, z) => x < 1 || z < 1 || x > 15 || z > 15 || pieces.some((p) => Math.abs(p.at[0] - x) < 1 && Math.abs(p.at[1] - z) < 1);
      for (const [index, p] of pieces.entries()) {
        if (p.piece !== 'straight' || p.flow || (p.level ?? 0) !== 0) continue;
        const across = p.rotation % 180 === 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (const [dx, dz] of across) if (!taken(p.at[0] + dx, p.at[1] + dz)) return { index, to: [p.at[0] + dx, p.at[1] + dz], turn: p.rotation % 180 === 0 };
      }
      return null;
    });
    let joined = false;
    if (target) {
      const tile = page3.locator('[data-part="straight"]');
      await tile.scrollIntoViewIfNeeded();
      const box = await tile.boundingBox();
      await page3.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page3.mouse.down();
      const to = await page3.evaluate(([x, z]) => window.__trafficDebug.screenOf(x, z), target.to);
      for (let i = 1; i <= 8; i++) await page3.mouse.move(box.x + ((to.x - box.x) * i) / 8, box.y + ((to.y - box.y) * i) / 8);
      if (target.turn) await page3.keyboard.press('r');
      await page3.waitForTimeout(300);
      await page3.mouse.move(to.x + 1, to.y);
      await page3.waitForTimeout(300);
      const said = (await page3.locator('.placement-reason').textContent()) ?? '';
      await page3.mouse.up();
      await page3.waitForTimeout(800);
      const becomes = await page3.evaluate((i) => window.__trafficDebug.scene().pieces[i].piece, target.index);
      await page3.keyboard.press('Control+z');
      await page3.waitForTimeout(800);
      const undone = await page3.evaluate((i) => window.__trafficDebug.scene().pieces[i].piece, target.index);
      if (target.turn) for (let i = 0; i < 3; i++) await page3.keyboard.press('r'); // back to the default turn
      joined = said.includes('Makes a T-junction') && becomes === 't-junction' && undone === 'straight';
    }
    editorChecks.perpendicularRoadJoinsAsTJunction = joined;
  }
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
const openPage = async (target) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(target);
  await page.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  await toMainStreetAt30s(page);
  return { page, errors };
};
// Dock (P2): Phosphor icons, the run length beside the progress bar, an icon per section.
const dockChecks = {};
{
  const { page } = await openPage(url);
  dockChecks.layout = await page.evaluate(() => {
    const run = document.querySelector('.dock-run');
    const has = (selector, ...names) => names.every((n) => document.querySelector(`${selector} .icon-${n}`));
    return (
      !!run?.querySelector('.play-ring .ring') &&
      !document.querySelector('.timeline, .progress') && // P25: no horizontal timeline
      has('[data-action="play-pause"]', 'play') &&
      has('[data-action="restart"]', 'restart') &&
      has('.duration-trigger', 'caret') &&
      has('.dock-traffic', 'gauge') &&
      has('.parts-toggle', 'wrench') &&
      has('[data-action="zoom-in"]', 'plus') &&
      [...document.querySelectorAll('svg.icon')].every((svg) => svg.getAttribute('aria-hidden') === 'true')
    );
  });
  // P24: every visible button is flat (no shadow, no gradient) with a 50%-opacity fill and a 1px border.
  await page.mouse.move(5, 5); // nothing hovered (a hovered button shows a stronger fill)
  await page.waitForTimeout(400); // let the hover fill fade back
  dockChecks.flatButtons = await page.evaluate(() =>
    [...document.querySelectorAll('.dock button, .scene-pill button, .camera-controls button')]
      .filter((b) => b.offsetParent && !b.closest('.dock')) // the HUD's buttons share its glass (P25): checked below
      .filter((b) => {
        const style = getComputedStyle(b);
        const alpha = Number((style.backgroundColor.match(/[\d.]+(?=\)$)/) ?? ['1'])[0]);
        return !(style.boxShadow === 'none' && style.backgroundImage === 'none' && style.borderTopWidth === '1px' && Math.abs(alpha - 0.5) < 0.06);
      })
      .map((b) => `${b.getAttribute('aria-label') || b.textContent.trim()}: ${getComputedStyle(b).backgroundColor} ${getComputedStyle(b).boxShadow}`),
  );
  if (dockChecks.flatButtons.length) console.error('Not flat:', dockChecks.flatButtons);
  dockChecks.flatButtons = dockChecks.flatButtons.length === 0;
  // Nothing marked hidden is drawn: the on-piece rotate button stayed visible off the left edge before.
  dockChecks.hiddenMeansHidden = await page.evaluate(() =>
    [...document.querySelectorAll('[hidden]')].every((el) => getComputedStyle(el).display === 'none'),
  );
  dockChecks.labelsUnchanged = (await page.getByRole('button', { name: 'Customise' }).count()) === 1 && (await page.getByRole('button', { name: 'Reset run' }).count()) === 1;
  // No Reset View button (removed from the dock at the owner's request); the camera panel is a slim strip of three icon buttons.
  dockChecks.noResetViewButton = await page.evaluate(() => {
    const resets = [...document.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().toLowerCase() === 'reset view');
    const panel = [...document.querySelectorAll('.camera-controls button')];
    // Since the owner moved Sound here (2026-11-14): zoom in, zoom out, light/dark, then Sound directly below it.
    const theme = document.querySelector('.camera-controls .theme-toggle');
    return resets.length === 0 && panel.length === 4 && panel.every((b) => b.querySelector('svg.icon') && !b.textContent?.trim()) && theme.nextElementSibling?.classList.contains('sound-toggle') && panel[3].getBoundingClientRect().top >= theme.getBoundingClientRect().bottom;
  });
  await page.locator('.dock').screenshot({ path: `${outDir}/30-dock-icons.png` });
  // P25: one glass toolbar, laid out like tldraw's: Play ring · countdown · Reset | Duration | Traffic load | Customise.
  dockChecks.hudOrder = await page.evaluate(() => {
    const xs = ['[data-action="play-pause"]', '.countdown', '[data-action="restart"]', '.duration-trigger', '.intensity', '.parts-toggle'].map(
      (sel) => document.querySelector(`.dock ${sel}`)?.getBoundingClientRect().x ?? NaN,
    );
    return xs.every((x, i) => i === 0 || x > xs[i - 1]) && document.querySelectorAll('.dock .dock-divider').length === 3 && !document.querySelector('.dock .sound-toggle');
  });
  dockChecks.hudSharedGlass = await page.evaluate(() => {
    const dock = getComputedStyle(document.querySelector('.dock'));
    const pill = getComputedStyle(document.querySelector('.scene-pill'));
    const buttons = [...document.querySelectorAll('.dock button')].map((b) => getComputedStyle(b));
    return (
      dock.backdropFilter.includes('blur') &&
      dock.backgroundColor === pill.backgroundColor && // the scene picker gets the same glass
      dock.backdropFilter === pill.backdropFilter &&
      buttons.every((b) => b.boxShadow === 'none' && b.borderTopColor === 'rgba(0, 0, 0, 0)') &&
      // Clear at rest on the shared glass (Duration keeps a faint fill: it's a dropdown).
      [...document.querySelectorAll('.dock button:not(.duration-trigger)')].every((b) => getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)') &&
      // One control height; Play is that plus its ring.
      new Set([...document.querySelectorAll('.dock button:not(.play-button)')].map((b) => getComputedStyle(b).height)).size === 1
    );
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/33-hud-idle-over-map.png` });
  const closedTriggerFill = await page.evaluate(() => getComputedStyle(document.querySelector('.duration-trigger')).backgroundColor);
  // The Duration menu (this page is at 30 s): opens above its button, in the same glass, with 30 s marked; arrows and Enter pick another.
  await page.getByRole('button', { name: 'Duration: 30 s' }).click();
  await page.waitForTimeout(200);
  dockChecks.durationMenuOpensAbove = await page.evaluate(() => {
    const menu = document.querySelector('.duration-menu');
    const trigger = document.querySelector('.duration-trigger').getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const selected = [...menu.querySelectorAll('[role="option"]')].filter((o) => o.ariaSelected === 'true').map((o) => o.textContent.trim());
    return (
      menu.matches(':popover-open') &&
      box.bottom <= trigger.top &&
      getComputedStyle(menu).backgroundColor === getComputedStyle(document.querySelector('.dock')).backgroundColor &&
      selected.join() === '30 s' &&
      document.activeElement?.textContent.trim() === '30 s' &&
      document.querySelector('.duration-trigger').getAttribute('aria-expanded') === 'true'
    );
  });
  // Open, the button shows the blue selected tint, not its resting fill.
  dockChecks.durationOpenLooksSelected = (await page.evaluate(() => getComputedStyle(document.querySelector('.duration-trigger')).backgroundColor)) !== closedTriggerFill;
  await page.screenshot({ path: `${outDir}/34-hud-duration-menu.png`, clip: { x: 220, y: 600, width: 1000, height: 300 } });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  dockChecks.durationMenuByKeyboard =
    (await page.getByRole('button', { name: 'Duration: 60 s' }).count()) === 1 &&
    (await page.locator('.countdown').textContent()) === '1:00 run' &&
    (await page.evaluate(() => !document.querySelector('.duration-menu').matches(':popover-open') && document.activeElement?.classList.contains('duration-trigger')));
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  dockChecks.durationMenuEscapes = await page.evaluate(
    () => !document.querySelector('.duration-menu').matches(':popover-open') && document.activeElement?.classList.contains('duration-trigger'),
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/37-hud-dark.png`, clip: { x: 220, y: 600, width: 1000, height: 300 } });
  await page.close();
}

// Parts tray (P5): a picture of every part, bottom-right, clear of the map's centre and the dock.
const trayChecks = {};
for (const [width, height] of [[1440, 900], [1280, 800]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url);
  await page.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  await wholeBoardInView(page); // zoomed out to the whole board, the tray must still leave it all in view
  await page.getByRole('button', { name: 'Customise' }).click();
  const pictured = await page
    .waitForFunction(() => [...document.querySelectorAll('.part-picture')].every((t) => t.style.backgroundImage.startsWith('url("data:image/png')), null, { timeout: 20000 })
    .then(() => true, () => false);
  await page.waitForTimeout(300); // the view re-centres beside the tray
  const layout = await page.evaluate((dev) => {
    const tray = document.querySelector('.parts-drawer').getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('.part-picture')];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      everyPartPictured: tiles.length > 0 && tiles.every((t) => getComputedStyle(t).backgroundImage.startsWith('url("data:image/png')),
      bottomRight: innerWidth - tray.right < 40 && tray.left > innerWidth / 2,
      clearOfDock: !overlaps(tray, dock),
      belowCameraPanel: tray.top >= document.querySelector('.camera-controls').getBoundingClientRect().bottom,
      // The whole board stays in view beside the tray (its corners, on the dev server where they can be located).
      // Zoomed out to the whole board (the app starts closer since P20), its corners stay in view beside the tray.
      boardClear: !dev || [[0, 0], [16, 0], [0, 16], [16, 16]].every(([x, z]) => {
        const p = window.__trafficDebug.screenOf(x, z);
        return p.x < tray.left && p.x > 0 && p.y > 0;
      }),
    };
  }, isDevServer);
  trayChecks[`at${width}`] = pictured && Object.values(layout).every(Boolean);
  if (!trayChecks[`at${width}`]) trayChecks[`detail${width}`] = layout; // shown only on failure
  await page.screenshot({ path: `${outDir}/33-tray-${width}.png` });
  await page.close();
}

// A clicked vehicle (dev server): its card opens where the road inspector goes, refreshes as it drives, and closes.
const vehicleCardChecks = {};
if (isDevServer) {
  const fast = new URL(url);
  const { page, errors } = await openPage(fast.toString());
  const press = async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  };
  const playPause = page.locator('.dock [data-action="play-pause"]');
  await playPause.click();
  await page.waitForTimeout(2500);
  const car = await page.evaluate(() => window.__trafficDebug.vehicles().find((v) => v.x > 320 && v.x < 1100 && v.y > 150 && v.y < 650 && v.speed > 3));
  let opened = false;
  let moves = false;
  if (car) {
    // P21: hovering a car shows a pointer and "Click for details".
    await page.mouse.move(car.x, car.y);
    vehicleCardChecks.hoverPointerAndHint = await page
      .waitForFunction(() => 'overVehicle' in document.querySelector('canvas').dataset && (document.querySelector('.vehicle-tooltip')?.textContent ?? '').includes('Click for details'), null, { timeout: 2000 })
      .then(() => page.evaluate(() => getComputedStyle(document.querySelector('canvas')).cursor === 'pointer'), () => false);
    await press(car.x, car.y);
    const card = page.locator('.vehicle-card');
    opened = await card.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false);
    const text = (await card.textContent()) ?? '';
    opened &&= ['Vehicle', 'Driver', 'Now', 'Trajectory', 'Following time', 'Heading for', 'Distance left'].every((t) => text.includes(t));
    // P15: highlights first (driver, speed, doing, heading for); the full sections behind Show more details.
    const highlights = await page.locator('.vehicle-highlights dt').allTextContents();
    const toggle = page.locator('.vehicle-details-toggle');
    const body = page.locator('.vehicle-card-body');
    const collapsed = JSON.stringify(highlights) === JSON.stringify(['Driver', 'Habits', 'Speed', 'Doing', 'Heading for']) && (await body.isHidden()) && (await toggle.getAttribute('aria-expanded')) === 'false';
    await page.screenshot({ path: `${outDir}/38-vehicle-card-highlights.png` });
    await toggle.click();
    const expanded = (await body.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'true' && (await toggle.textContent()) === 'Hide details';
    // From the keyboard: Enter hides them again, and opens them once more.
    await toggle.focus();
    await page.keyboard.press('Enter');
    const hidesAgain = (await body.isHidden()) && (await toggle.getAttribute('aria-expanded')) === 'false';
    await page.keyboard.press('Enter');
    const keyboardOpens = await body.isVisible();
    vehicleCardChecks.highlightsFirstThenDetails = collapsed && expanded && hidesAgain && keyboardOpens;
    // P21: the card shows a picture of the vehicle's own model.
    vehicleCardChecks.modelPicture = await page
      .waitForFunction(() => (document.querySelector('.vehicle-picture')?.style.backgroundImage ?? '').startsWith('url("data:image/png'), null, { timeout: 4000 })
      .then(() => true, () => false);
    // Its route (P13): flat on the road, hidden by vehicles in front (depth-tested, not drawn over everything);
    // drawn as a row of thick chevrons at 60% opacity (owner subtask).
    await page.waitForTimeout(300); // the card's first refresh draws the route
    const route = await page.evaluate(() => window.__trafficDebug.route());
    vehicleCardChecks.routeOnTheRoadUnderVehicles = route.shown && route.depthTested && !route.writesDepth;
    vehicleCardChecks.routeIsChevronsAt60 = route.chevrons > 1 && Math.abs(route.opacity - 0.6) < 1e-6;
    await page.screenshot({ path: `${outDir}/38c-route-chevrons.png` });
    // The selected vehicle has a soft glow under it that fades to nothing at its edge, not an outlined ring.
    vehicleCardChecks.glowUnderVehicle = route.glow.shown && route.glow.centre > 0.5 && route.glow.rim === 0 && !route.glow.outlined;
    await page.screenshot({ path: `${outDir}/39-vehicle-glow.png`, clip: { x: Math.max(0, car.x - 200), y: Math.max(0, car.y - 150), width: 400, height: 300 } });
    const position = () => page.locator('.vehicle-card dt', { hasText: 'Position' }).locator('xpath=following-sibling::dd[1]').textContent();
    const before = await position();
    await page.waitForTimeout(1200);
    moves = (await position()) !== before || (await card.textContent())?.includes('left the board');
    await page.screenshot({ path: `${outDir}/38b-vehicle-card-details.png` });
  }
  vehicleCardChecks.clickOpensCard = opened;
  vehicleCardChecks.cardFollowsTheVehicle = moves;
  await page.getByRole('button', { name: 'Close vehicle details' }).click().catch(() => {});
  vehicleCardChecks.closes = await page.locator('.vehicle-card').isHidden();
  // The details stay open for the next vehicle clicked, as the player left them.
  const next = await page.evaluate(() => window.__trafficDebug.vehicles().find((v) => v.x > 320 && v.x < 1100 && v.y > 150 && v.y < 650));
  if (next) {
    await press(next.x, next.y);
    await page.locator('.vehicle-card').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    vehicleCardChecks.detailsStayOpenForNextVehicle = await page.locator('.vehicle-card-body').isVisible();
    await page.getByRole('button', { name: 'Close vehicle details' }).click().catch(() => {});
  }
  vehicleCardChecks.noPageErrors = errors.length === 0;
  await page.close();
}

// Phones and tablets (P18): only the "meant for a laptop" message; the 3D app isn't loaded.
const handheldChecks = {};
for (const [name, viewport, touch] of [['phone', { width: 390, height: 844 }, true], ['tablet', { width: 1024, height: 1366 }, true], ['narrow desktop', { width: 800, height: 900 }, false]]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, colorScheme: name === 'tablet' ? 'dark' : 'light' });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const models = [];
  p.on('request', (r) => r.url().endsWith('.glb') && models.push(r.url()));
  await p.goto(url);
  await p.waitForTimeout(1500);
  const shown = await p.evaluate(() => ({
    message: document.querySelector('#app.laptop-only')?.textContent?.includes('meant to be experienced on a laptop') ?? false,
    canvas: !!document.querySelector('canvas'),
  }));
  handheldChecks[name] = (touch ? shown.message && !shown.canvas && models.length === 0 : !shown.message && shown.canvas) && errors.length === 0;
  if (touch) await p.screenshot({ path: `${outDir}/40-handheld-${name}.png` });
  await context.close();
}

// Background: plain colour (P13), with the topographic contours (P9) as their own layer.
const backgroundChecks = {};
{
  const { page } = await openPage(url);
  const image = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  // Plain background (P13: the owner removed the coloured columns); the contours are their own layer below.
  backgroundChecks.plainBackground = image === 'none';
  // Topographic contours (P9): a fixed layer masked by the generated SVG, behind the app, in the theme's colour.
  const contours = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body, '::before');
      return { mask: style.maskImage || style.webkitMaskImage, colour: style.backgroundColor, position: style.position };
    });
  const light = await contours();
  const svgLoads = await page.evaluate(() => fetch('images/topographic.svg').then((r) => r.ok && r.headers.get('content-type')?.includes('svg')));
  await page.locator('.theme-toggle').click();
  const toggled = await contours();
  await page.locator('.theme-toggle').click();
  backgroundChecks.topographicContours = light.mask.includes('topographic.svg') && light.position === 'fixed' && svgLoads && toggled.colour !== light.colour;
  await page.close();
}

// Real presses (P1): a person's click holds the button ~100 ms, so the button must not be rebuilt under it.
const pressChecks = {};
{
  const { page, errors } = await openPage(url);
  /** Press like a person; false when the button isn't there to press. */
  const press = async (locator) => {
    const box = await locator.boundingBox({ timeout: 3000 }).catch(() => null);
    if (!box) return false;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    return true;
  };
  const state = () => page.evaluate(() => document.querySelector('.dock')?.dataset.state);
  const reaches = (wanted, timeout = 3000) =>
    page.waitForFunction((wanted) => document.querySelector('.dock')?.dataset.state === wanted, wanted, { timeout }).then(() => true, () => false);
  const sceneName = () => page.evaluate(() => document.querySelector('.scene-name')?.textContent);
  const playPause = page.locator('.dock [data-action="play-pause"]');
  pressChecks.playStartsRun = (await press(playPause)) && (await reaches('running'));
  await page.waitForTimeout(1000); // let the clock tick under the next press
  pressChecks.pauseStopsRun = (await press(playPause)) && (await reaches('paused'));
  // Reset on the pill while traffic runs: stops the run and restores the designer's network.
  // Dev server only: the edit that makes Reset appear goes through the debug hook.
  if (isDevServer) {
    const before = await sceneName();
    await page.evaluate(() => window.__trafficDebug.select({ kind: 'piece', index: 0 }));
    const removed = await page
      .getByRole('button', { name: 'Remove' })
      .click({ timeout: 3000 })
      .then(() => true, () => false);
    const runningAgain = (await press(playPause)) && (await reaches('running'));
    await page.waitForTimeout(500);
    const pressedReset = await press(page.getByRole('button', { name: 'Reset', exact: true }));
    pressChecks.resetWorksWhileRunning =
      removed &&
      runningAgain &&
      pressedReset &&
      (await reaches('ready', 10000)) &&
      (await sceneName()) === before &&
      (await page.getByRole('button', { name: 'Reset', exact: true }).isHidden());
  }
  pressChecks.noPageErrors = errors.length === 0;
  await page.close();
}

// P26: the building-toy editor and sound. Click-to-place, the rotation ring, replace in place,
// the Remove tool and undo; each committed edit sounds once, previews and cancels stay quiet,
// the traffic ambience follows the run, and the Sound switch survives a reload.
const toyChecks = { recorded: {} };
if (isDevServer) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const open = async (scene) => {
    const target = new URL(url);
    target.searchParams.set('scene', scene);
    target.searchParams.set('timeScale', '6');
    await page.goto(target.toString());
    await page.waitForSelector('.scene-name');
    await page.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  };
  await open('blank-board');
  await page.evaluate(() => localStorage.clear());
  await open('blank-board');
  const debug = (fn, arg) => page.evaluate(fn, arg);
  const sounds = async () => (await debug(() => window.__trafficDebug.sound())).log;
  const effects = async () => (await sounds()).filter((e) => e.startsWith('effect:'));
  const pieces = () => debug(() => window.__trafficDebug.scene().pieces);
  const screenOf = (x, z) => debug(([x, z]) => window.__trafficDebug.screenOf(x, z), [x, z]);
  const soundSwitch = page.getByRole('switch', { name: 'Sound' });
  toyChecks.mutedOnFirstVisit = (await soundSwitch.getAttribute('aria-checked')) === 'false' && (await soundSwitch.getAttribute('title')) === 'Turn sound on';
  await soundSwitch.click();
  toyChecks.switchSaysOn = (await soundSwitch.getAttribute('aria-checked')) === 'true' && (await soundSwitch.getAttribute('title')) === 'Turn sound off';
  await page.getByRole('button', { name: 'Customise' }).click();
  await wholeBoardInView(page);
  const start = (await pieces()).length;

  // Place: click a part, then click the map; the piece lands exactly where its preview was. Moving the preview is quiet.
  await page.locator('.parts-groups [data-part="straight"]').click();
  toyChecks.clickArmsPart = (await page.locator('.parts-groups [data-part="straight"]').getAttribute('aria-pressed')) === 'true';
  const previews = [];
  let quietWhileMoving = true;
  for (const x of [7.5, 8.5, 9.5]) {
    const at = await screenOf(x, 8.5);
    const before = (await sounds()).length;
    await page.mouse.move(at.x - 30, at.y - 20, { steps: 4 });
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await page.waitForTimeout(150);
    quietWhileMoving &&= (await sounds()).length === before;
    previews.push(await debug(() => JSON.parse(JSON.stringify(window.__trafficDebug.preview()?.placement ?? null))));
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(500);
  }
  const placed = (await pieces()).slice(start);
  toyChecks.clickPlacesWherePreviewed = placed.length === 3 && placed.every((p, i) => JSON.stringify(p) === JSON.stringify(previews[i]));
  toyChecks.previewMovesQuietly = quietWhileMoving;
  toyChecks.placeSoundsOncePerPiece = (await effects()).join() === 'effect:place,effect:place,effect:place';
  await page.keyboard.press('Escape');
  toyChecks.escapePutsPartDown = (await debug(() => window.__trafficDebug.preview())) === null && (await page.locator('.parts-groups [data-part][aria-pressed]').count()) === 0;
  // An invalid drop stays quiet and changes nothing.
  {
    const before = { pieces: (await pieces()).length, effects: (await effects()).length };
    await page.locator('.parts-groups [data-part="roundabout"]').click();
    const corner = await screenOf(0.6, 15.4);
    await page.mouse.move(corner.x, corner.y, { steps: 4 });
    await page.waitForTimeout(150);
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(300);
    toyChecks.invalidDropQuiet = (await pieces()).length === before.pieces && (await effects()).length === before.effects;
    await page.keyboard.press('Escape');
  }

  // Rotate: clicking the middle road shows the ring; dragging previews a turn with its connections; Escape cancels quietly; release commits once.
  const middle = start + 1;
  const pickMiddle = async () => {
    const at = await screenOf(8.5, 8.5);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
  };
  await pickMiddle();
  toyChecks.selectionShowsRing = (await page.locator('.piece-rotate').isVisible()) && !!(await page.locator('.handle-grip').getAttribute('d'));
  const dragRing = async ({ escape = false } = {}) => {
    const centre = await screenOf(8.5, 8.5);
    const knob = await page.locator('.piece-rotate').boundingBox();
    const [kx, ky] = [knob.x + knob.width / 2, knob.y + knob.height / 2];
    const radius = Math.hypot(kx - centre.x, ky - centre.y);
    const from = Math.atan2(ky - centre.y, kx - centre.x);
    await page.mouse.move(kx, ky);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const a = from - (i / 12) * (Math.PI / 2);
      await page.mouse.move(centre.x + radius * Math.cos(a), centre.y + radius * Math.sin(a));
    }
    await page.waitForTimeout(250);
    const during = {
      label: await page.locator('.placement-reason').textContent(),
      broken: await page.locator('.connection.broken').count(),
      rotation: (await pieces())[middle]?.rotation,
    };
    if (escape) await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(500);
    return during;
  };
  const beforeTurn = (await effects()).length;
  const cancelled = await dragRing({ escape: true });
  toyChecks.turnPreviewShowsBreaks = cancelled.broken === 2 && (cancelled.label ?? '').includes('2 break') && cancelled.rotation === 0;
  toyChecks.escapeCancelsTurnQuietly = (await pieces())[middle].rotation === 0 && (await effects()).length === beforeTurn;
  await pickMiddle();
  await dragRing();
  const turned = (await pieces()).at(-1);
  toyChecks.releaseCommitsTurnWithOneTick = turned.at.join() === '8.5,8.5' && turned.rotation % 180 === 90 && (await effects()).slice(beforeTurn).join() === 'effect:rotate';
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  toyChecks.undoTurnsItBack = (await pieces()).find((p) => p.at.join() === '8.5,8.5')?.rotation === 0 && (await effects()).slice(beforeTurn).length === 1;

  // Replace: the drawer lists what fits first; a pick is previewed in place (the original stays) with the connections it keeps.
  await pickMiddle();
  await page.locator('.inspector:not(.vehicle-card)').getByRole('button', { name: 'Replace…' }).click();
  await page.waitForTimeout(300);
  const firstOption = await page.locator('[data-replace]').first().textContent();
  await page.locator('[data-replace="t-junction"]').click();
  await page.waitForTimeout(500);
  const beforeConfirm = { pieces: await pieces(), effects: (await effects()).length };
  toyChecks.replacePreviewKeepsOriginal =
    (firstOption ?? '').includes('Keeps all') &&
    beforeConfirm.pieces.find((p) => p.at.join() === '8.5,8.5')?.piece === 'straight' &&
    (await page.locator('.connection.kept').count()) === 2 &&
    ((await page.locator('.replace-confirm').textContent()) ?? '').includes('2 stay connected');
  await page.locator('.inspector:not(.vehicle-card)').getByRole('button', { name: 'Replace', exact: true }).click();
  await page.waitForTimeout(600);
  toyChecks.replaceConfirmsOnce =
    (await pieces()).find((p) => p.at.join() === '8.5,8.5')?.piece === 't-junction' &&
    (await pieces()).length === beforeConfirm.pieces.length &&
    (await effects()).slice(beforeConfirm.effects).join() === 'effect:place';

  // Remove from the inspector: a tap, the toast, and Undo from the toast.
  await pickMiddle();
  const beforeRemove = { count: (await pieces()).length, effects: (await effects()).length };
  await page.locator('.inspector:not(.vehicle-card)').getByRole('button', { name: 'Remove' }).click();
  await page.waitForTimeout(600);
  toyChecks.removeShowsToastAndTaps =
    (await pieces()).length === beforeRemove.count - 1 &&
    ((await page.locator('.edit-toast').textContent()) ?? '').replace(/\s+/g, ' ').includes('Road removed · Undo') &&
    (await effects()).slice(beforeRemove.effects).join() === 'effect:remove';
  await page.locator('.edit-toast').getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(600);
  toyChecks.toastUndoRestores = (await pieces()).length === beforeRemove.count && (await page.locator('.edit-toast').isHidden());

  // The Remove tool: hovering outlines what a click removes; two clicks remove two roads, each its own undoable edit.
  await page.locator('[data-action="remove-tool"]').click();
  const toolOn = (await page.locator('[data-action="remove-tool"]').getAttribute('aria-pressed')) === 'true';
  const west = await screenOf(7.5, 8.5);
  await page.mouse.move(west.x, west.y, { steps: 4 });
  await page.waitForTimeout(200);
  const hoverSays = await page.locator('.placement-reason').textContent();
  const beforeTool = { count: (await pieces()).length, effects: (await effects()).length };
  await page.screenshot({ path: `${outDir}/35-remove-tool-hover.png` });
  await page.mouse.click(west.x, west.y);
  await page.waitForTimeout(600);
  const east = await screenOf(9.5, 8.5);
  await page.mouse.move(east.x, east.y, { steps: 4 });
  await page.mouse.click(east.x, east.y);
  await page.waitForTimeout(600);
  toyChecks.removeToolClearsInSuccession =
    toolOn && (hoverSays ?? '').includes('Click to remove') && (await pieces()).length === beforeTool.count - 2 && (await effects()).slice(beforeTool.effects).join() === 'effect:remove,effect:remove';
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  toyChecks.eachRemovalIsOneUndo = (await pieces()).length === beforeTool.count - 1;
  await page.keyboard.press('Escape');
  toyChecks.escapeLeavesRemoveTool = (await page.locator('[data-action="remove-tool"]').getAttribute('aria-pressed')) === 'false';

  // Main Street: the preference survived the reload; the ambience follows the run, the switch silences it at once.
  await open('main-street');
  toyChecks.preferenceSurvivesReload = (await soundSwitch.getAttribute('aria-checked')) === 'true';
  const ambience = () => debug(() => window.__trafficDebug.sound().ambience);
  const ambienceIs = (on) => page.waitForFunction((on) => window.__trafficDebug.sound().ambience === on, on, { timeout: 8000 }).then(() => true, () => false);
  toyChecks.quietBeforePlay = (await ambience()) === false;
  await page.getByRole('button', { name: 'Play' }).click();
  const inWhileRunning = await ambienceIs(true);
  await page.getByRole('button', { name: 'Pause' }).click();
  const outOnPause = await ambienceIs(false);
  await page.getByRole('button', { name: 'Play' }).click();
  const inAgain = await ambienceIs(true);
  await soundSwitch.click();
  const silencedAtOnce = (await ambience()) === false && (await sounds()).at(-1) === 'silence';
  await soundSwitch.click();
  const backOnMidRun = await ambienceIs(true);
  await page.getByRole('button', { name: 'Reset run' }).click();
  const outOnReset = await ambienceIs(false);
  const log = await sounds();
  toyChecks.ambienceFollowsRun = inWhileRunning && outOnPause && inAgain && outOnReset;
  toyChecks.switchSilencesAndRestores = silencedAtOnce && backOnMidRun;
  // Never two fade-ins without a fade-out or silence between: one layer, not a pile-up.
  toyChecks.oneAmbienceLayer = log
    .filter((e) => e.startsWith('ambience') || e === 'silence')
    .map((e) => (e === 'ambience:in' ? 'in' : 'out'))
    .every((e, i, all) => i === 0 || !(e === 'in' && all[i - 1] === 'in'));
  toyChecks.recorded.ambienceLog = log.filter((e) => !e.startsWith('effect'));
  // Customise during a run pauses it: traffic stays still while the layout changes.
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Customise' }).click();
  toyChecks.customisePausesTraffic = (await page.locator('.dock').getAttribute('data-state')) === 'paused' && (await ambienceIs(false));
  // The selected road with its rotation ring, in the scene.
  {
    const road = await debug(() => window.__trafficDebug.scene().pieces.findIndex((p) => p.piece === 'straight' && p.at[0] === 5.5 && p.at[1] === 7.5));
    const at = await screenOf(5.5, 7.5);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(400);
    toyChecks.recorded.selectedRoad = road;
    toyChecks.ringOnSelectedRoad = await page.locator('.piece-rotate').isVisible();
    await page.mouse.move(5, 450);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/34-selected-road-rotation-ring.png` });
  }
  toyChecks.noPageErrors = errors.length === 0;
  toyChecks.recorded.errors = errors.slice(0, 3);
  await context.close();
}

// Every preset runs: cycle the pill and play each one for a moment (also against the deployed app).
const presetRunChecks = {};
{
  const { page, errors } = await openPage(url);
  const ran = {};
  for (let i = 0; i < 5; i++) {
    const name = (await page.locator('.scene-name').textContent())?.trim();
    if (name !== 'Blank board') {
      await page.getByRole('button', { name: 'Play' }).click();
      ran[name] = await page
        .waitForFunction(() => {
          return Number(document.querySelector('.dock')?.dataset.clock) >= 1;
        }, null, { timeout: 8000 })
        .then(() => true, () => false);
      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('button', { name: 'Reset run' }).click();
    }
    await page.getByRole('button', { name: 'Next scene' }).click();
    await page.waitForSelector('.status', { state: 'hidden', timeout: 60000 });
  }
  presetRunChecks.allFourPresetsRun = ['Main Street', 'Market Roundabout', 'School Run', 'Flyover Bottleneck'].every((n) => ran[n] === true);
  presetRunChecks.noPageErrors = errors.length === 0;
  presetRunChecks.recorded = { ran, errors: errors.slice(0, 3) };
  await page.close();
}

// Dev server only: a before/after edit, and a player's own scenario on the Blank board, through the UI.
const scenarioChecks = {};
if (isDevServer) {
  const fast = new URL(url);
  fast.searchParams.set('timeScale', '15');
  const { page, errors } = await openPage(fast.toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  await toMainStreetAt30s(page); // the reload opens on the defaults again
  const finishRun = () => page.waitForFunction(() => document.querySelector('.dock')?.dataset.state === 'ended', null, { timeout: 60000 });
  /** Each results row's cells, by its heading: { 'Trips due · entered · finished': ['11 · 11 · 2', '11 · 11 · 1'], ... }. */
  const resultRows = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('.results-card tbody tr:not(.group)')].map((r) => [r.querySelector('th')?.textContent?.trim(), [...r.querySelectorAll('td')].map((td) => td.textContent?.trim())]),
      ),
    );
  const trips = (cell) => (cell ?? '').split('·').map((n) => Number(n.trim()));

  // Before/after: run Main Street, shorten the first junction's arterial green, run again with the same traffic.
  // The light is selected through the debug hook (a click on a small 3D sign is covered by the T12 editor checks);
  // the timing inspector and Apply are the real UI.
  await page.getByRole('button', { name: 'Play' }).click();
  await finishRun();
  await page.evaluate(() => window.__trafficDebug.select({ kind: 'control', index: 0 }));
  await page.locator('[data-timing="green"]').fill('8');
  await page.getByRole('button', { name: 'Apply timing' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Play' }).click();
  await finishRun();
  await page.waitForTimeout(200);
  const rows = await resultRows();
  const queues = Object.entries(rows).filter(([heading]) => heading?.startsWith('Junction'));
  const [thisRun, previousRun] = [0, 1].map((i) => trips(rows['Trips due · entered · finished']?.[i]));
  scenarioChecks.beforeAfterSameArrivals = thisRun[0] === previousRun[0] && thisRun[1] === previousRun[1];
  scenarioChecks.beforeAfterEditChangesQueues = queues.length > 0 && queues.some(([, [now, before]]) => now !== before);
  scenarioChecks.beforeAfterResultsLabelled = ((await page.locator('.results-card').textContent()) ?? '').includes('Previous run');
  scenarioChecks.recorded = { beforeAfterQueues: Object.fromEntries(queues) };
  await page.locator('.top-stack').screenshot({ path: `${outDir}/25-before-after.png` });

  // The Blank board: a signalised crossroads in the middle with roads out to all four edges.
  await page.getByRole('button', { name: 'Previous scene' }).click();
  await page.getByRole('button', { name: 'Discard and switch' }).click();
  await page.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
  scenarioChecks.onBlankBoard = (await page.locator('.scene-name').textContent())?.trim() === 'Blank board';
  await wholeBoardInView(page); // a scene opens zoomed in; the build drags across the whole board
  const sceneryBefore = await page.evaluate(() => window.__trafficDebug.scenery().items);
  await page.getByRole('button', { name: 'Customise' }).click();
  /** Drag a part from the drawer to tile (x, z); answers whether the preview said valid just before release. */
  const drop = async (part, x, z) => {
    const tile = page.locator(`[data-part="${part}"]`);
    await tile.scrollIntoViewIfNeeded(); // the tray scrolls
    const box = await tile.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const target = await page.evaluate(([x, z]) => window.__trafficDebug.screenOf(x, z), [x, z]);
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + ((target.x - box.x) * i) / 6, box.y + ((target.y - box.y) * i) / 6);
    await page.waitForTimeout(250);
    await page.mouse.move(target.x + 1, target.y);
    const valid = await page.evaluate(() => window.__trafficDebug.preview()?.valid === true);
    await page.mouse.up();
    await page.waitForTimeout(350);
    return valid;
  };
  const CENTRE = 8; // the crossroads tile
  const EDGE = 15; // tiles 1..14 are inside the edge stubs' reach on the 16-tile board
  const APPROACH = 0.45; // from the crossroads centre to where each road enters it, tiles
  const drops = [];
  for (let x = 1; x < EDGE; x++) drops.push(await drop(x === CENTRE ? 'crossroad' : 'straight', x + 0.5, CENTRE + 0.5));
  await page.keyboard.press('r'); // a quarter turn for the north–south arm
  for (let z = 1; z < EDGE; z++) if (z !== CENTRE) drops.push(await drop('straight', CENTRE + 0.5, z + 0.5));
  for (let i = 0; i < 3; i++) await page.keyboard.press('r');
  const c = CENTRE + 0.5;
  for (const [x, z] of [[c, c - APPROACH], [c + APPROACH, c], [c, c + APPROACH], [c - APPROACH, c]]) drops.push(await drop('signal', x, z));
  scenarioChecks.everyDropValid = drops.length === 31 && drops.every(Boolean);
  const built = await page.evaluate(() => ({ pieces: window.__trafficDebug.scene().pieces.length, controls: window.__trafficDebug.scene().controls.length }));
  const blankPieces = 4; // the board's edge stubs
  scenarioChecks.networkBuilt = built.pieces === blankPieces + 27 && built.controls === 4;
  // Roads built over open ground clear its scenery (P8).
  scenarioChecks.roadsClearScenery = (await page.evaluate(() => window.__trafficDebug.scenery().items)) < sceneryBefore;
  await page.screenshot({ path: `${outDir}/26-blank-board-built.png` });
  // 90 s: in 30 s no trip has time to cross the 16-tile board through one default-timed light.
  await chooseDuration(page, 90);
  await page.getByRole('button', { name: 'Play' }).click();
  await finishRun();
  await page.waitForTimeout(200);
  const scenarioRows = await resultRows();
  const [due, entered, finished] = trips(scenarioRows['Trips due · entered · finished']?.[0]);
  scenarioChecks.scenarioRunsToResults = ((await page.locator('.results-card .run-label').first().textContent()) ?? '').includes('Blank board') && finished > 0;
  scenarioChecks.recorded.blankBoardTrips = { due, entered, finished };
  await page.screenshot({ path: `${outDir}/27-blank-board-results.png` });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  scenarioChecks.scenarioSaved = await page
    .getByRole('button', { name: 'Save', exact: true })
    .waitFor({ state: 'hidden', timeout: 5000 })
    .then(
      () => page.evaluate((count) => JSON.parse(localStorage.getItem('traffic-sim:scene:blank-board') ?? 'null')?.pieces?.length === count, blankPieces + 27),
      () => false,
    );
  scenarioChecks.noPageErrors = errors.length === 0;
  scenarioChecks.recorded.errors = errors.slice(0, 3);
  await page.evaluate(() => localStorage.clear());
  await page.close();
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
      // Scenery (P8): trees and the rest drawn, instanced (a few dozen draws for the whole board).
      scenery: await presetPage.evaluate(() => {
        const { meshes, items } = window.__trafficDebug.scenery();
        return items > 0 && meshes > 0 && meshes < 40;
      }),
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
const resetDisabledDuringFailure = await failPage.getByRole('button', { name: 'Zoom in' }).isDisabled();
await failPage.screenshot({ path: `${outDir}/10-asset-failure.png` });
blockVehicle = false;
await failPage.getByRole('button', { name: 'Retry' }).click();
await failPage.waitForSelector('.status', { state: 'hidden', timeout: 30000 });
const retryRecovered = await failPage.getByRole('button', { name: 'Zoom in' }).isEnabled();
await browser.close();

const differs = (a, b) => !a.equals(b);
const result = {
  url,
  consoleErrors,
  assetRequests,
  opensOnDefaults,
  plainDragTurnsView: differs(initial, plainDrag),
  spaceDragPanChangedView: differs(plainDrag, panned),
  arrowKeysOnFocusedMapTurnView: differs(panned, keyboardTurned) && mapFocusRing,
  spacePanWorksWithMapFocused: differs(keyboardTurned, panWithMapFocused),
  noJoystick,
  rightDragChangedView: differs(panWithMapFocused, rightDragged),
  zoomChangedView: differs(rightDragged, zoomed),
  zoomButtonChangedView: differs(zoomed, zoomButton),
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
  vehicleCardChecks,
  dockChecks,
  toyChecks,
  trayChecks,
  handheldChecks,
  backgroundChecks,
  pressChecks,
  presetRunChecks,
  scenarioChecks,
  blockedAtEntries,
};
writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

/** Every pass/fail flag in a group of checks holds (`recorded` holds values, not checks). */
const passed = (checks) => Object.entries(checks).every(([name, value]) => name === 'recorded' || value === true);
const ok =
  consoleErrors.length === 0 &&
  !assetRequests.some((r) => !r.startsWith('200') && !r.startsWith('304')) &&
  result.opensOnDefaults &&
  result.plainDragTurnsView &&
  result.spaceDragPanChangedView &&
  result.arrowKeysOnFocusedMapTurnView &&
  result.spacePanWorksWithMapFocused &&
  result.noJoystick &&
  result.rightDragChangedView &&
  result.zoomButtonChangedView &&
  result.spacePanWorksWithButtonFocused &&
  result.spaceReleaseDidNotPressFocusedButton &&
  result.zoomChangedView &&
  failureMessage === "Couldn't load models/vehicles/sedan.glb" &&
  retryFocused &&
  resetDisabledDuringFailure &&
  retryRecovered &&
  Object.values(runChecks).every(Boolean) &&
  passed(vehicleCardChecks) &&
  passed(dockChecks) &&
  passed(toyChecks) &&
  passed(trayChecks) &&
  passed(handheldChecks) &&
  passed(backgroundChecks) &&
  passed(pressChecks) &&
  passed(presetRunChecks) &&
  passed(scenarioChecks);
process.exit(ok ? 0 : 1);
