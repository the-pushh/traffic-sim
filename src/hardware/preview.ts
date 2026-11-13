// Preview of the hardware controls at their intended size over the simulation (dev only:
// http://localhost:5173/preview/controls.html). Not wired into the app yet.
import './hardware.css';
import { createControlsDrawer, createDetentedKnob, createFivePositionSwitch, createJoystick, createPushButton, createTimelineSlider } from './controls';
import { icon } from '../components/icons';

const VOLUME = ['Almost empty', 'Low', 'Medium', 'High', 'Congested'] as const;
const DURATION = 30;

document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #141115; font-family: -apple-system, system-ui, sans-serif; }
    .stage { position: fixed; inset: 0; background: url('/preview/sim-backdrop.jpg') center / cover no-repeat; }
    .main-panel { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; padding: 10px 14px 10px 18px; }
    .main-panel .time { width: 84px; text-align: right; white-space: nowrap; }
    .main-panel .divider { align-self: stretch; width: 1px; background: rgb(0 0 0 / 0.5); box-shadow: 1px 0 0 rgb(255 255 255 / 0.06); }
    .pane { right: 16px; bottom: 16px; width: 300px; max-height: min(470px, calc(100vh - 32px)); }
    .row { display: flex; align-items: center; gap: 12px; }
    .row + .row { margin-top: 10px; }
    .stack { display: grid; justify-items: center; gap: 6px; }
    .option { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4px 12px; }
    .option + .option { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgb(0 0 0 / 0.4); box-shadow: 0 1px 0 rgb(255 255 255 / 0.04) inset; }
    .option .hw-legend { grid-column: 1 / -1; }
    .readout-line { margin-top: 10px; }
    .toast { position: fixed; left: 16px; top: 16px; padding: 7px 10px; border-radius: 6px; background: rgb(20 17 21 / 0.82); color: #e9e5ec; font: 500 11px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 0.02em; }
  </style>`,
);

const stage = document.createElement('div');
stage.className = 'stage';
const toast = document.createElement('div');
toast.className = 'toast';
toast.setAttribute('role', 'status');
toast.textContent = 'Preview — press Controls to open the drawer';
const say = (text: string) => (toast.textContent = text);
document.body.append(stage, toast);

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- Main panel: timeline and the Controls button ----
const panel = document.createElement('div');
panel.className = 'main-panel hw-panel';
const time = document.createElement('span');
time.className = 'time hw-readout';
const timeline = createTimelineSlider({
  label: 'Run time',
  duration: DURATION,
  majorEvery: 10,
  minorEvery: 2,
  value: 12,
  onScrub: (s) => {
    time.textContent = `${clock(s)} / ${clock(DURATION)}`;
    say(`Timeline: ${s.toFixed(1)} s`);
  },
  onCommit: (s) => {
    time.textContent = `${clock(s)} / ${clock(DURATION)}`;
    say(`Timeline: ${s.toFixed(1)} s`);
  },
});
time.textContent = `${clock(12)} / ${clock(DURATION)}`;
const divider = document.createElement('span');
divider.className = 'divider';

// ---- The drawer's pane: grouped controls ----
const pane = document.createElement('section');
pane.className = 'pane';
pane.innerHTML = `<div class="hw-drawer-scroll"></div>`;
const scroll = pane.querySelector<HTMLElement>('.hw-drawer-scroll')!;
const group = (title: string) => {
  const g = document.createElement('div');
  g.className = 'hw-group';
  g.innerHTML = `<h3>${title}</h3>`;
  scroll.append(g);
  return g;
};

// Camera: joystick, zoom, reset view.
const camera = group('Camera');
const tiltReadout = document.createElement('div');
tiltReadout.className = 'hw-readout';
const joystick = createJoystick({
  label: 'Orbit and tilt camera',
  onTilt: (x, y) => (tiltReadout.textContent = `x ${x >= 0 ? '+' : ''}${x.toFixed(2)}  y ${y >= 0 ? '+' : ''}${y.toFixed(2)}`),
});
tiltReadout.textContent = 'x +0.00  y +0.00';
const cameraButtons = document.createElement('div');
cameraButtons.className = 'stack';
for (const [label, name] of [['Zoom in', 'plus'], ['Zoom out', 'minus']] as const) {
  const b = createPushButton({ label, icon: icon(name), onPress: () => say(`${label} pressed`) });
  cameraButtons.append(b.element);
}
const resetView = createPushButton({ label: 'Reset view', wide: true, onPress: () => say('Reset view pressed') });
cameraButtons.append(resetView.element);
const camRow = document.createElement('div');
camRow.className = 'row';
const joyStack = document.createElement('div');
joyStack.className = 'stack';
joyStack.append(joystick.element, tiltReadout);
camRow.append(joyStack, cameraButtons);
camera.append(camRow);

// Traffic volume: option A (switch) and option B (knob), kept in step so they can be compared.
const volume = group('Traffic volume');
const volumeReadout = document.createElement('div');
volumeReadout.className = 'hw-readout readout-line';
const show = (i: number) => (volumeReadout.textContent = `Volume: ${VOLUME[i]}`);
let knob: ReturnType<typeof createDetentedKnob>;
const lever = createFivePositionSwitch({
  label: 'Traffic volume',
  positions: VOLUME,
  value: 2,
  onChange: (i) => {
    knob.set(i);
    show(i);
    say(`Switch: ${VOLUME[i]}`);
  },
});
knob = createDetentedKnob({
  label: 'Traffic volume',
  positions: VOLUME,
  value: 2,
  onChange: (i) => {
    lever.set(i);
    show(i);
    say(`Knob: ${VOLUME[i]}`);
  },
});
show(2);
const optionA = document.createElement('div');
optionA.className = 'option';
optionA.innerHTML = '<span class="hw-legend">Option A · switch</span>';
optionA.append(lever.element);
const optionB = document.createElement('div');
optionB.className = 'option';
optionB.innerHTML = '<span class="hw-legend">Option B · knob</span>';
optionB.append(knob.element);
volume.append(optionA, optionB, volumeReadout);

// Scene: save and reset.
const sceneGroup = group('Scene');
const sceneRow = document.createElement('div');
sceneRow.className = 'row';
for (const label of ['Save', 'Reset']) sceneRow.append(createPushButton({ label, wide: true, onPress: () => say(`${label} pressed`) }).element);
sceneGroup.append(sceneRow);

const drawer = createControlsDrawer({ label: 'Controls', pane });
drawer.button.addEventListener('click', () => say(drawer.open ? 'Controls drawer open' : 'Controls drawer closed'));
panel.append(timeline.element, time, divider, drawer.button);
document.body.append(panel, pane);

// For checks and the recording.
(window as unknown as { __hw: unknown }).__hw = { drawer, joystick, timeline, lever, knob };
