import { PCFSoftShadowMap, PerspectiveCamera, Timer, WebGLRenderer } from 'three';
import { attachJoystickControl, setJoystickEnabled } from '../components/joystickControl';
import '../styles/main.css';
import { CameraJoystick } from '../three/controls/cameraJoystick';
import { ObserverCamera } from '../three/controls/observerCamera';
import { attachViewportInput } from '../three/controls/viewportInput';
import { AssetLoadError } from '../three/loaders/assetLoader';
import { createStarterScene } from '../three/scene/createStarterScene';

const ZOOM_STEP = 0.8;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar">
    <h1>Traffic Simulator</h1>
    <span class="hint" id="camera-hint">Over the map: hold Space and drag to pan, scroll to zoom · Joystick orbits and tilts (arrow keys when it’s focused)</span>
  </header>
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
    <div class="status" role="status" aria-live="polite"><p>Loading road and vehicle…</p></div>
  </main>
`;

const viewport = app.querySelector<HTMLElement>('.viewport')!;
const status = app.querySelector<HTMLElement>('.status')!;

// Transparent canvas: the page's --color-background token shows behind the scene.
const renderer = new WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
viewport.prepend(renderer.domElement);

const camera = new PerspectiveCamera(45, 1, 0.1, 500);

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
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

async function start() {
  setCameraControlsEnabled(false);
  detachInput?.();
  detachInput = null;
  observer = null;
  status.hidden = false;
  status.className = 'status';
  status.innerHTML = '<p>Loading road and vehicle…</p>';
  try {
    const { scene, bounds } = await createStarterScene(renderer, import.meta.env.BASE_URL);
    observer = ObserverCamera.framing(camera, bounds);
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
      joystick.update(Math.min(timer.getDelta(), 0.1));
      renderer.render(scene, camera);
    });
    status.hidden = true;
    setCameraControlsEnabled(true);
  } catch (error) {
    console.error(error);
    const message = error instanceof AssetLoadError ? error.message : 'Couldn’t start the 3D scene.';
    status.className = 'status error';
    status.innerHTML = `<p></p><button type="button" class="primary">Retry</button>`;
    status.querySelector('p')!.textContent = message;
    const retry = status.querySelector('button')!;
    retry.addEventListener('click', start, { once: true });
    retry.focus();
  }
}

start();
