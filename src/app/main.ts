import { type Group, type Object3D, PCFSoftShadowMap, PerspectiveCamera, Timer, WebGLRenderer } from 'three';
import type { SceneDefinition } from '../simulation/network/scene';
import { createEditor } from './editor';
import { createDock } from '../components/dock';
import { createFirstVisitTip } from '../components/firstVisitTip';
import { createResultsCard } from '../components/resultsCard';
import { attachJoystickControl, setJoystickEnabled } from '../components/joystickControl';
import { createLeaveDialog } from '../components/leaveDialog';
import { createScenePill } from '../components/scenePill';
import { createVehicleTooltip } from '../components/vehicleTooltip';
import { RunController } from '../simulation/runController';
import '../styles/main.css';
import { CameraJoystick } from '../three/controls/cameraJoystick';
import { fitCameraToViewport } from '../three/controls/cameraViewport';
import { ObserverCamera } from '../three/controls/observerCamera';
import { attachViewportInput } from '../three/controls/viewportInput';
import { AssetLoadError } from '../three/loaders/assetLoader';
import { PRESETS } from '../scenes/presets';
import { browserStorage, SceneStore } from '../scenes/sceneStore';
import { createAssetLoader } from '../three/loaders/assetLoader';
import { createSceneView, SceneDefinitionError } from '../three/scene/createSceneView';
import { createQueueLabels } from '../three/scene/queueLabels';
import { createTrafficLayer, VEHICLE_MODEL_NAMES } from '../three/scene/trafficLayer';
import { createVehiclePicker } from '../three/scene/vehiclePicker';
import { exposeTrafficDebug } from './devHooks';
import { TrafficSession } from '../simulation/traffic/trafficSession';

/**
 * The scenes the pill cycles through, each as designed or as saved in this browser. The app
 * opens on Main Street; the dev server can open another with `?scene=<id>` for browser checks.
 */
const openingId = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
const store = new SceneStore(PRESETS, browserStorage(), PRESETS.some((p) => p.id === openingId) ? openingId! : PRESETS[0].id);

const ZOOM_STEP = 0.8;

/** Dev-only speed-up for browser checks, e.g. `?timeScale=10` (1–100). Ignored in production builds. */
function devTimeScale() {
  if (!import.meta.env.DEV) return 1;
  const value = Number(new URLSearchParams(location.search).get('timeScale'));
  return Number.isFinite(value) && value >= 1 && value <= 100 ? value : 1;
}
const TIME_SCALE = devTimeScale();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1 class="visually-hidden">Traffic Simulator</h1>
  <main class="viewport" aria-label="3D traffic scene">
    <div class="camera-controls" role="group" aria-label="Camera">
      <div class="joystick" tabindex="0" role="application" aria-roledescription="joystick"
        aria-label="Orbit and tilt camera" aria-describedby="joystick-help" title="Drag or use arrow keys: left/right orbits, up/down tilts">
        <div class="joystick-knob"></div>
      </div>
      <span id="joystick-help" class="visually-hidden">Drag the knob or hold arrow keys. Left and right orbit around the view; up tilts toward overhead, down toward an angled view.</span>
      <button type="button" data-action="zoom-in" disabled aria-label="Zoom in" title="Zoom in">+</button>
      <button type="button" data-action="zoom-out" disabled aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" data-action="reset-view" disabled class="primary">Reset View</button>
      <button type="button" data-action="theme" class="theme-toggle"></button>
    </div>
    <div class="bottom-stack"></div>
    <div class="status" role="status" aria-live="polite"><p>Loading roads and vehicles…</p></div>
  </main>
`;

const viewport = app.querySelector<HTMLElement>('.viewport')!;
const status = app.querySelector<HTMLElement>('.status')!;
const bottomStack = app.querySelector<HTMLElement>('.bottom-stack')!;

// Run controls: created once; inert while a scene loads.
const run = new RunController();
const tip = createFirstVisitTip(bottomStack, () => run.duration);
const runUnderWay = () => run.state === 'running' || run.state === 'paused';
const leaveDialog = createLeaveDialog(app);
/** Move to another scene, asking first if there are unsaved edits. */
async function switchScene(direction: 'previous' | 'next') {
  if (runUnderWay()) return;
  if (store.isUnsaved()) {
    const choice = await leaveDialog.ask();
    if (choice === 'cancel') return pill.focus(direction);
    if (choice === 'save' && !store.save()) return pill.saveFailed();
  }
  if (direction === 'next') store.next();
  else store.previous();
  // Loading makes the controls inert, which drops focus: put it back on the arrow used.
  if (await start()) pill.focus(direction);
}
/** Keep the scene's edits in this browser, or say it didn't work. */
function saveScene() {
  if (!store.save()) pill.saveFailed();
}
const pill = createScenePill(bottomStack, {
  previous: () => void switchScene('previous'),
  next: () => void switchScene('next'),
  save: saveScene,
  reset: () => void resetScene(),
});
/** Back to the designer's network (it also clears the run). Allowed while paused, when edits are. */
async function resetScene() {
  if (run.state === 'running') return;
  store.reset();
  if (await start()) pill.focus('next');
}
const dock = createDock(bottomStack, run, { onPlay: () => tip.dismiss() });
let session: TrafficSession | null = null;
const results = createResultsCard(bottomStack, () => session!.results(), () => run.state);
bottomStack.inert = true;


function syncRunUi() {
  dock.sync();
  tip.sync();
  if (session) results.sync();
  syncPill();
}

function syncPill() {
  pill.sync({ name: store.current().name, canSwitch: !runUnderWay(), canEdit: run.state !== 'running', unsaved: store.isUnsaved(), differsFromDesign: store.differsFromDesign() });
}

// Transparent canvas: the page's --color-background token shows behind the scene.
const renderer = new WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
viewport.prepend(renderer.domElement);

const camera = new PerspectiveCamera(45, 1, 0.1, 500);

/** Fraction of the screen height covered by the scene pill and dock (the tip is temporary and not counted). */
let coveredBottom = 0;
function resize() {
  const { clientWidth: width, clientHeight: height } = viewport;
  renderer.setSize(width, height, false);
  // Measure from the panels' real layout: everything from the top of the scene pill down.
  const panelsTop = pill.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  const covered = Math.max(0, height - panelsTop);
  coveredBottom = fitCameraToViewport(camera, { width, height, covered });
}
new ResizeObserver(resize).observe(viewport);
resize();


const cameraControls = app.querySelector<HTMLElement>('.camera-controls')!;
let observer: ObserverCamera | null = null;
let detachInput: (() => void) | null = null;
const joystickElement = app.querySelector<HTMLElement>('.joystick')!;
const timer = new Timer();

// Light or dark: follows the system until the player picks one, remembered in this browser.
const THEME_KEY = 'traffic-sim:theme';
const themeToggle = app.querySelector<HTMLButtonElement>('.theme-toggle')!;
function currentTheme(): 'light' | 'dark' {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function showTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  themeToggle.textContent = next === 'dark' ? '☾' : '☀';
  themeToggle.setAttribute('aria-label', `Switch to ${next} mode`);
  themeToggle.title = `Switch to ${next} mode`;
}
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {
  // Storage blocked: follow the system.
}
showTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', showTheme);

cameraControls.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest('button')?.dataset.action;
  if (action === 'theme') {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not remembered; it still applies now.
    }
    showTheme();
    return;
  }
  if (!observer) return;
  if (action === 'zoom-in') observer.zoom(ZOOM_STEP);
  if (action === 'zoom-out') observer.zoom(1 / ZOOM_STEP);
  if (action === 'reset-view') observer.resetView();
});

function setCameraControlsEnabled(enabled: boolean) {
  for (const button of cameraControls.querySelectorAll('button:not(.theme-toggle)')) (button as HTMLButtonElement).disabled = !enabled;
  setJoystickEnabled(joystickElement, enabled);
}

let tooltip: ReturnType<typeof createVehicleTooltip> | null = null;

let currentView: Awaited<ReturnType<typeof createSceneView>> | null = null;
let currentLayers: Object3D[] = [];
let vehicleModels: Group[] | null = null;
let joystick: CameraJoystick | null = null;
/** Opening scenes and applying edits one at a time, in order. */
let loading: Promise<boolean> = Promise.resolve(true);

/**
 * Show the scene the store has on screen. `open`: a scene opened from the pill (Ready,
 * framed afresh). `edit`: the player changed it (camera kept; a paused run carries on).
 */
function start(mode: 'open' | 'edit' = 'open'): Promise<boolean> {
  loading = loading.then(() => show(mode));
  return loading;
}

async function show(mode: 'open' | 'edit'): Promise<boolean> {
  const currentScene = store.current();
  const opening = mode === 'open' || !session || !observer;
  if (opening) {
    renderer.setAnimationLoop(null);
    bottomStack.inert = true;
    // A new scene starts from Ready: fresh traffic, nothing measured yet.
    if (run.state !== 'ready') run.restart();
    syncPill();
    setCameraControlsEnabled(false);
    detachInput?.();
    detachInput = null;
    observer = null;
    status.hidden = false;
    status.className = 'status';
    status.innerHTML = '<p>Loading roads and vehicles…</p>';
  }
  try {
    const load = createAssetLoader(import.meta.env.BASE_URL);
    const [view, models] = await Promise.all([
      createSceneView(currentScene, import.meta.env.BASE_URL),
      vehicleModels ?? Promise.all(VEHICLE_MODEL_NAMES.map((name) => load.model(`models/vehicles/${name}.glb`))),
    ]);
    vehicleModels = models;
    // Swap the views: free what the last one built for itself (vehicles and badges are shared and stay).
    renderer.setAnimationLoop(null);
    currentView?.scene.remove(...currentLayers);
    currentView?.dispose();
    const { scene, bounds, graph, updateSignals, updateBlocked } = view;
    const traffic = createTrafficLayer(graph, new Map(VEHICLE_MODEL_NAMES.map((name, i) => [name, models[i]])));
    scene.add(traffic.group);
    if (opening) session = new TrafficSession(currentScene, graph, run);
    else session!.edit(currentScene, graph);
    const queueLabels = createQueueLabels(session!.approaches);
    scene.add(queueLabels.group);
    tooltip ??= createVehicleTooltip(viewport, renderer.domElement);
    const pickVehicle = createVehiclePicker(traffic.group);
    currentView = view;
    currentLayers = [traffic.group, queueLabels.group];
    exposeTrafficDebug({
      canvas: renderer.domElement,
      camera,
      traffic: traffic.group,
      graph,
      simulation: () => session!.simulation,
      queues: () => session!.approaches.map((a, i) => ({ approach: a.name, live: session!.liveQueues()[i] })),
      queueLabelsShown: queueLabels.visibleCount,
      store,
      apply: (edited) => applyEdit(edited),
      preview: () => editor.preview(),
      select: (target) => editor.select(target),
    });
    if (opening) {
      observer = ObserverCamera.framing(camera, bounds, { coveredBottom });
      joystick = new CameraJoystick(observer);
      const detachViewport = attachViewportInput(renderer.domElement, observer);
      const detachJoystick = attachJoystickControl(joystickElement, joystick);
      detachInput = () => {
        detachViewport();
        detachJoystick();
      };
      editor.reset();
      timer.reset();
    }
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      const delta = Math.min(timer.getDelta(), 0.1);
      joystick!.update(delta);
      const current = session!;
      current.advance(run.tick(delta * TIME_SCALE));
      traffic.sync(current.simulation);
      updateSignals(current.simulation.time);
      updateBlocked(current.simulation.blockedAtEntries());
      queueLabels.update(current.liveQueues());
      tooltip!.update((ndc) => pickVehicle(camera, ndc), current.simulation, time);
      syncRunUi();
      editor.sync();
      renderer.render(scene, camera);
    });
    status.hidden = true;
    setCameraControlsEnabled(true);
    bottomStack.inert = false;
    return true;
  } catch (error) {
    console.error(error);
    const message = error instanceof AssetLoadError || error instanceof SceneDefinitionError ? error.message : 'Couldn’t start the 3D scene.';
    status.hidden = false;
    status.className = 'status error';
    status.innerHTML = `<p></p><button type="button" class="primary" data-action="retry">Retry</button>`;
    status.querySelector('p')!.textContent = message;
    const retry = status.querySelector<HTMLButtonElement>('[data-action="retry"]')!;
    retry.addEventListener('click', () => void start(), { once: true });
    // A saved version that won't open shouldn't trap the player: offer the designer's network.
    if (store.differsFromDesign()) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Reset to the designer’s network';
      reset.addEventListener('click', () => void resetScene(), { once: true });
      status.append(reset);
    }
    // The scene pill stays usable: another scene, or Reset, is always within reach.
    bottomStack.inert = false;
    retry.focus();
    return false;
  }
}

/** The player edited the map: it becomes the scene on screen (unsaved) and the traffic adapts. */
async function applyEdit(scene: SceneDefinition) {
  store.edit(scene);
  await start('edit');
}

const editor = createEditor({
  stack: bottomStack,
  viewport,
  canvas: renderer.domElement,
  camera,
  scene: () => store.current(),
  view: () => currentView?.scene ?? null,
  model: (name) => createAssetLoader(import.meta.env.BASE_URL).model(`models/roads/${name}.glb`),
  apply: (scene) => applyEdit(scene).then(() => undefined),
  canEdit: () => run.state !== 'running',
});
dock.element.append(editor.toggle);

start();
