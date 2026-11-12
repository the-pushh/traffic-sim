import { PCFSoftShadowMap, PerspectiveCamera, Timer, WebGLRenderer } from 'three';
import { createDock } from '../components/dock';
import { createFirstVisitTip } from '../components/firstVisitTip';
import { createResultsCard } from '../components/resultsCard';
import { attachJoystickControl, setJoystickEnabled } from '../components/joystickControl';
import { createScenePill } from '../components/scenePill';
import { createVehicleTooltip } from '../components/vehicleTooltip';
import { RunController } from '../simulation/runController';
import '../styles/main.css';
import { CameraJoystick } from '../three/controls/cameraJoystick';
import { fitCameraToViewport } from '../three/controls/cameraViewport';
import { ObserverCamera } from '../three/controls/observerCamera';
import { attachViewportInput } from '../three/controls/viewportInput';
import { AssetLoadError } from '../three/loaders/assetLoader';
import { mainStreet } from '../scenes/mainStreet';
import { createAssetLoader } from '../three/loaders/assetLoader';
import { createSceneView, SceneDefinitionError } from '../three/scene/createSceneView';
import { createQueueLabels } from '../three/scene/queueLabels';
import { createTrafficLayer, VEHICLE_MODEL_NAMES } from '../three/scene/trafficLayer';
import { createVehiclePicker } from '../three/scene/vehiclePicker';
import { exposeTrafficDebug } from './devHooks';
import { TrafficSession } from '../simulation/traffic/trafficSession';

/** The scene the app opens on; the scene carousel (T11) will cycle through the presets. */
const currentScene = mainStreet;

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
    </div>
    <div class="bottom-stack"></div>
    <div class="status" role="status" aria-live="polite"><p>Loading roads and vehicles…</p></div>
  </main>
`;

const viewport = app.querySelector<HTMLElement>('.viewport')!;
const status = app.querySelector<HTMLElement>('.status')!;
const bottomStack = app.querySelector<HTMLElement>('.bottom-stack')!;

// Run controls: created once, inert until the scene has loaded.
const run = new RunController();
const tip = createFirstVisitTip(bottomStack, () => run.duration);
const pill = createScenePill(bottomStack, currentScene.name);
const dock = createDock(bottomStack, run, { onPlay: () => tip.dismiss() });
let session: TrafficSession | null = null;
const results = createResultsCard(bottomStack, () => session!.results(), () => run.state);
bottomStack.inert = true;


function syncRunUi() {
  dock.sync();
  tip.sync();
  if (session) results.sync();
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

cameraControls.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest('button')?.dataset.action;
  if (!observer) return;
  if (action === 'zoom-in') observer.zoom(ZOOM_STEP);
  if (action === 'zoom-out') observer.zoom(1 / ZOOM_STEP);
  if (action === 'reset-view') observer.resetView();
});

function setCameraControlsEnabled(enabled: boolean) {
  for (const button of cameraControls.querySelectorAll('button')) button.disabled = !enabled;
  setJoystickEnabled(joystickElement, enabled);
}

let tooltip: ReturnType<typeof createVehicleTooltip> | null = null;

async function start() {
  setCameraControlsEnabled(false);
  detachInput?.();
  detachInput = null;
  observer = null;
  status.hidden = false;
  status.className = 'status';
  status.innerHTML = '<p>Loading roads and vehicles…</p>';
  try {
    const load = createAssetLoader(import.meta.env.BASE_URL);
    const [view, vehicleModels] = await Promise.all([
      createSceneView(currentScene, import.meta.env.BASE_URL),
      Promise.all(VEHICLE_MODEL_NAMES.map((name) => load.model(`models/vehicles/${name}.glb`))),
    ]);
    const { scene, bounds, graph, updateSignals, updateBlocked } = view;
    const traffic = createTrafficLayer(graph, new Map(VEHICLE_MODEL_NAMES.map((name, i) => [name, vehicleModels[i]])));
    scene.add(traffic.group);
    session = new TrafficSession(currentScene, graph, run);
    const queueLabels = createQueueLabels(session.approaches);
    scene.add(queueLabels.group);
    tooltip ??= createVehicleTooltip(viewport, renderer.domElement);
    const pickVehicle = createVehiclePicker(traffic.group);
    exposeTrafficDebug(renderer.domElement, camera, traffic.group, graph, () => session!.simulation, () => session!.approaches.map((a, i) => ({ approach: a.name, live: session!.liveQueues()[i] })), queueLabels.visibleCount);
    observer = ObserverCamera.framing(camera, bounds, { coveredBottom });
    const joystick = new CameraJoystick(observer);
    const detachViewport = attachViewportInput(renderer.domElement, observer);
    const detachJoystick = attachJoystickControl(joystickElement, joystick);
    detachInput = () => {
      detachViewport();
      detachJoystick();
    };
    timer.reset();
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      const delta = Math.min(timer.getDelta(), 0.1);
      joystick.update(delta);
      const current = session!;
      current.advance(run.tick(delta * TIME_SCALE));
      traffic.sync(current.simulation);
      updateSignals(current.simulation.time);
      updateBlocked(current.simulation.blockedAtEntries());
      queueLabels.update(current.liveQueues());
      tooltip!.update((ndc) => pickVehicle(camera, ndc), current.simulation, time);
      syncRunUi();
      renderer.render(scene, camera);
    });
    status.hidden = true;
    setCameraControlsEnabled(true);
    bottomStack.inert = false;
  } catch (error) {
    console.error(error);
    const message = error instanceof AssetLoadError || error instanceof SceneDefinitionError ? error.message : 'Couldn’t start the 3D scene.';
    status.className = 'status error';
    status.innerHTML = `<p></p><button type="button" class="primary">Retry</button>`;
    status.querySelector('p')!.textContent = message;
    const retry = status.querySelector('button')!;
    retry.addEventListener('click', start, { once: true });
    retry.focus();
  }
}

start();
