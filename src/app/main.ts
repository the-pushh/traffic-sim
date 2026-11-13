import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type Object3D, PCFSoftShadowMap, PerspectiveCamera, RingGeometry, Timer, WebGLRenderer } from 'three';
import { routeRibbon } from '../three/scene/routeRibbon';
import type { LaneGraph } from '../simulation/network/buildLaneGraph';
import type { TrafficSimulation } from '../simulation/traffic/trafficSimulation';
import { boardToWorld } from '../scenes/board';
import { createVehicleCard } from '../components/vehicleCard';
import { describeVehicle } from '../components/vehicleDetails';
import type { SceneDefinition } from '../simulation/network/scene';
import { createEditor } from './editor';
import { demandFollowsEntries } from '../editor/edits';
import { icon } from '../components/icons';
import { createDock } from '../components/dock';
import { createFirstVisitTip } from '../components/firstVisitTip';
import { createResultsCard } from '../components/resultsCard';
import { createLeaveDialog } from '../components/leaveDialog';
import { createScenePill } from '../components/scenePill';
import { createVehicleTooltip } from '../components/vehicleTooltip';
import { RunController } from '../simulation/runController';
import '../styles/main.css';
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
import { DrawOnDemand } from '../three/render/drawOnDemand';
import { renderThumbnails } from '../three/thumbnails/partThumbnails';
import { ResolutionGovernor } from '../three/render/resolutionGovernor';
import { TrafficSession } from '../simulation/traffic/trafficSession';

/**
 * The scenes the pill cycles through, each as designed or as saved in this browser. The app
 * opens on Flyover Bottleneck (DEFAULT_SCENE); the dev server can open another with `?scene=<id>` for browser checks.
 */
const openingId = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
/** The scene the app opens on (the owner's choice); `?scene=` overrides it on the dev server. */
const DEFAULT_SCENE = 'flyover-bottleneck';
/** How much closer than the whole-board view the camera starts (the owner's default: twice as close). */
const START_ZOOM = 2;
const store = new SceneStore(PRESETS, browserStorage(), PRESETS.some((p) => p.id === openingId) ? openingId! : DEFAULT_SCENE);

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
      <span id="map-help" class="visually-hidden">Drag to turn the view: left and right orbit, up and down tilt. Hold Space and drag to pan, scroll to zoom. With the map focused, the arrow keys turn the view.</span>
      <button type="button" data-action="zoom-in" disabled aria-label="Zoom in" title="Zoom in">${icon('plus')}</button>
      <button type="button" data-action="zoom-out" disabled aria-label="Zoom out" title="Zoom out">${icon('minus')}</button>
      <button type="button" data-action="theme" class="theme-toggle"></button>
    </div>
    <div class="top-stack"></div>
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
/** Back to the designer's network. Works at any time: a run under way ends, as on opening a scene. */
async function resetScene() {
  store.reset();
  if (await start()) pill.focus('next');
}
const dock = createDock(bottomStack, run, { onPlay: () => tip.dismiss() });
let session: TrafficSession | null = null;
// Results open at the top centre (owner's choice), clear of the dock.
const topStack = app.querySelector<HTMLElement>('.top-stack')!;
const results = createResultsCard(topStack, () => session!.results(), () => run.state);
bottomStack.inert = true;


function syncRunUi() {
  dock.sync();
  tip.sync();
  if (session) results.sync();
  syncPill();
}

function syncPill() {
  pill.sync({ name: store.current().name, canSwitch: !runUnderWay(), canSave: run.state !== 'running', unsaved: store.isUnsaved(), differsFromDesign: store.differsFromDesign() });
}

// Transparent canvas: the page's --color-background token shows behind the scene.
const renderer = new WebGLRenderer({ antialias: true, alpha: true });
// Full sharpness unless frames can't keep up (then fewer pixels, until the next scene opens).
const resolution = new ResolutionGovernor(window.devicePixelRatio);
renderer.setPixelRatio(resolution.pixelRatio);
function useResolution() {
  if (renderer.getPixelRatio() === resolution.pixelRatio) return;
  renderer.setPixelRatio(resolution.pixelRatio);
  resize();
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
viewport.prepend(renderer.domElement);
// The map takes keyboard focus: the arrow keys turn the view.
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Map view');
renderer.domElement.setAttribute('aria-describedby', 'map-help');

const camera = new PerspectiveCamera(45, 1, 0.1, 500);

/** A gap longer than this (a background tab, a debugger pause) counts as this long. */
const MAX_FRAME_GAP_MS = 100;
let drewLast = false;
let lastFrameTime = 0;

// ---- A clicked vehicle: its card (where the road inspector goes) and the rest of its route on the map ----
/** How often the open card's values refresh, ms (it changes as the vehicle drives). */
const CARD_REFRESH_MS = 200;
/** Lane points are at a piece's base; the road surface is 0.02 tiles up (where vehicles stand). The line sits just on it. */
const ROUTE_LIFT = 0.025;
let inspected: number | null = null;
let vehicleAt: ((ndc: { x: number; y: number }) => number | undefined) | null = null;
let inspectedGraph: LaneGraph | null = null;
let cardRefreshedAt = -Infinity;
/**
 * The rest of the inspected vehicle's route, painted on the road: a flat ribbon lying on the
 * road surface (`routeRibbon`), depth-tested so vehicles, signs and trees in front hide it, and
 * drawn after them (transparent) without writing depth. A small depth offset keeps it on top of
 * the road surface itself.
 */
const ROUTE_COLOUR = '#f487b6';
const ROUTE_WIDTH = 0.45; // world units: about a third of a lane
const onRoad = { depthTest: true, depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
const routeMaterial = new MeshBasicMaterial({ color: ROUTE_COLOUR, side: DoubleSide, ...onRoad });
const routeLine = new Group();
routeLine.name = 'inspected-route';
routeLine.visible = false;
let routePath: Mesh | null = null;
let drawnRoute = '';
/** A ring at the vehicle, where its route starts. */
const routeStart = new Mesh(new RingGeometry(0.9, 1.3, 32), new MeshBasicMaterial({ color: ROUTE_COLOUR, side: DoubleSide, ...onRoad }));
routeStart.rotation.x = -Math.PI / 2;
routeLine.add(routeStart);
const vehicleCard = createVehicleCard(viewport, () => inspectVehicle(null));
/** Pictures of the vehicle models for the card, drawn once each from the loaded models. */
const VEHICLE_PICTURE_SIZE = 120;
const vehiclePictures = new Map<string, Promise<string | null>>();
let picturedVehicle: number | null = null;
function vehiclePicture(model: string): Promise<string | null> {
  let picture = vehiclePictures.get(model);
  if (!picture) {
    const loaded = vehicleModels?.[VEHICLE_MODEL_NAMES.indexOf(model)];
    if (!loaded) return Promise.resolve(null);
    // Resolves with the picture, or null if it couldn't be drawn (the card then simply has none).
    picture = new Promise<string | null>((resolve) => {
      renderThumbnails([model], async () => loaded, (_, url) => resolve(url), VEHICLE_PICTURE_SIZE).then(
        () => resolve(null),
        () => resolve(null),
      );
    });
    vehiclePictures.set(model, picture);
  }
  return picture;
}
/** Open the card for a vehicle, or close it (null). The road inspector closes while a vehicle's card is open. */
function inspectVehicle(id: number | null) {
  inspected = id;
  picturedVehicle = null;
  cardRefreshedAt = -Infinity;
  drawnRoute = '';
  if (id === null) {
    vehicleCard.hide();
    routeLine.visible = false;
  }
  requestRender();
}
function syncVehicleCard(simulation: TrafficSimulation, now: number) {
  if (inspected === null || !inspectedGraph || now - cardRefreshedAt < CARD_REFRESH_MS) return;
  cardRefreshedAt = now;
  if (!simulation.has(inspected)) {
    vehicleCard.gone();
    if (routeLine.visible) {
      routeLine.visible = false;
      requestRender();
    }
    return;
  }
  const details = describeVehicle(simulation.vehicle(inspected), inspectedGraph, store.current());
  vehicleCard.show(inspected, details);
  if (picturedVehicle !== inspected) {
    picturedVehicle = inspected;
    const id = inspected;
    void vehiclePicture(details.model).then((url) => url && vehicleCard.picture(id, url));
  }
  // Redraw only when the route moved (a paused run's open card costs nothing).
  const key = `${details.path.length}:${details.path[0].join(',')}`;
  if (key === drawnRoute && routeLine.visible) return;
  drawnRoute = key;
  const points = details.path.map(([x, y, z]) => boardToWorld([x, y + ROUTE_LIFT, z]));
  if (routePath) {
    routeLine.remove(routePath);
    routePath.geometry.dispose();
  }
  const ribbon = routeRibbon(points, ROUTE_WIDTH);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(ribbon.positions, 3));
  geometry.setIndex(ribbon.indices);
  routePath = new Mesh(geometry, routeMaterial);
  routeLine.add(routePath);
  // The ring sits round the vehicle's centre (where the map draws it), not its front bumper.
  routeStart.position.set(...boardToWorld([details.centre[0], details.centre[1] + ROUTE_LIFT, details.centre[2]]));
  routeLine.visible = true;
  requestRender();
}

// ---- Drawing on demand: an idle map isn't drawn at all ----
const draws = new DrawOnDemand();
const requestRender = () => draws.request();
function frameChanged(current: TrafficSession): boolean {
  camera.updateMatrixWorld();
  return draws.changed({ view: camera.matrixWorld, projection: camera.projectionMatrix, traffic: current.simulation, time: current.simulation.time, state: run.state });
}

/** Fraction of the screen height covered by the scene pill and dock (the tip is temporary and not counted). */
let coveredBottom = 0;
/** The parts tray, once the editor exists: while open, the view centres in the space left of it. */
let rightPanel: HTMLElement | null = null;
function resize() {
  const { clientWidth: width, clientHeight: height } = viewport;
  renderer.setSize(width, height, false);
  // Measure from the panels' real layout: everything from the top of the scene pill down.
  const area = viewport.getBoundingClientRect();
  const panelsTop = pill.element.getBoundingClientRect().top - area.top;
  const covered = Math.max(0, height - panelsTop);
  const coveredRight = rightPanel && !rightPanel.hidden ? Math.max(0, area.right - rightPanel.getBoundingClientRect().left) : 0;
  coveredBottom = fitCameraToViewport(camera, { width, height, covered, coveredRight });
  requestRender();
}
new ResizeObserver(resize).observe(viewport);
// A lost and restored GPU context leaves the canvas blank until it's drawn again.
renderer.domElement.addEventListener('webglcontextrestored', requestRender);
resize();


const cameraControls = app.querySelector<HTMLElement>('.camera-controls')!;
let observer: ObserverCamera | null = null;
let detachInput: (() => void) | null = null;
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
  themeToggle.innerHTML = icon(next === 'dark' ? 'moon' : 'sun');
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
});

function setCameraControlsEnabled(enabled: boolean) {
  for (const button of cameraControls.querySelectorAll('button:not(.theme-toggle)')) (button as HTMLButtonElement).disabled = !enabled;
}

let tooltip: ReturnType<typeof createVehicleTooltip> | null = null;

let currentView: Awaited<ReturnType<typeof createSceneView>> | null = null;
let currentLayers: Object3D[] = [];
let vehicleModels: Group[] | null = null;
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
    vehicleAt = (ndc) => pickVehicle(camera, ndc);
    inspectedGraph = graph;
    scene.add(routeLine);
    if (opening) inspectVehicle(null);
    currentView = view;
    // Shared layers come out of the old scene before it's disposed (the route line keeps its material).
    currentLayers = [traffic.group, queueLabels.group, routeLine];
    exposeTrafficDebug({
      canvas: renderer.domElement,
      camera,
      traffic: traffic.group,
      view: scene,
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
      observer = ObserverCamera.framing(camera, bounds, { coveredBottom, zoom: START_ZOOM });
      // A drag turns the view, unless it starts on the selected piece (the editor moves that).
      detachInput = attachViewportInput(renderer.domElement, observer, { onSelection: (e) => editor.pressStartsOnSelection(e), placing: () => editor.preview() !== null });
      editor.reset();
      timer.reset();
      resolution.reset();
      useResolution();
    }
    requestRender();
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      const delta = Math.min(timer.getDelta(), 0.1);
      const current = session!;
      current.advance(run.tick(delta * TIME_SCALE));
      traffic.sync(current.simulation);
      updateSignals(current.simulation.time);
      updateBlocked(current.simulation.blockedAtEntries());
      queueLabels.update(current.liveQueues());
      tooltip!.update((ndc) => pickVehicle(camera, ndc), current.simulation, time);
      syncVehicleCard(current.simulation, time);
      syncRunUi();
      const editorChanged = editor.sync();
      // Draw only when something on the map changed: an idle map costs nothing.
      // Slow frames show up as long gaps while the map is being drawn; idle gaps show the screen's pace.
      if (lastFrameTime) {
        const gap = Math.min(time - lastFrameTime, MAX_FRAME_GAP_MS);
        if (drewLast) resolution.frame(gap);
        else resolution.idle(gap);
        useResolution(); // before drawing: changing the resolution clears the canvas
      }
      const drew = frameChanged(current) || editorChanged;
      if (drew) renderer.render(scene, camera);
      drewLast = drew;
      lastFrameTime = time;
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

/**
 * The player edited the map: it becomes the scene on screen (unsaved) and the traffic adapts.
 * Entry letters follow position, so a new edit's demand is moved to stay on the same road ends.
 */
async function applyEdit(scene: SceneDefinition, fromHistory = false) {
  store.edit(fromHistory ? scene : demandFollowsEntries(store.current(), scene));
  await start('edit');
}

// Models the editor previews and pictures, loaded once each.
const editorModels = new Map<string, Promise<Group>>();
const editorLoader = createAssetLoader(import.meta.env.BASE_URL);
const editor = createEditor({
  viewport,
  inspectVehicleAt: (event) => {
    if (!vehicleAt) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    const id = vehicleAt({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 });
    inspectVehicle(id ?? null);
    return id !== undefined;
  },
  cameraPanel: cameraControls,
  dock: dock.element,
  trayToggled: resize,
  canvas: renderer.domElement,
  camera,
  scene: () => store.current(),
  view: () => currentView?.scene ?? null,
  model: (name) => {
    let loading = editorModels.get(name);
    if (!loading) {
      loading = editorLoader.model(`models/roads/${name}.glb`);
      loading.catch(() => editorModels.delete(name)); // a failed load is tried again next time
      editorModels.set(name, loading);
    }
    return loading;
  },
  apply: (scene, fromHistory) => applyEdit(scene, fromHistory).then(() => undefined),
  canEdit: () => run.state !== 'running',
});
dock.addSection(editor.toggle);
rightPanel = editor.tray;

start();
