import { type Camera, Group, Mesh, MeshBasicMaterial, type Material, type Object3D, Plane, Raycaster, RingGeometry, type Scene, Vector2, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../scenes/board';
import { BOARD_TILES, type QuarterTurn, type SceneDefinition, type SignalTiming } from '../simulation/network/scene';
import { PIECES } from '../simulation/network/pieces';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import { EditHistory, movePiece, removeControl, removePiece, replacePiece, rotatePiece, setSignalTiming } from '../editor/edits';
import { PARTS, partById, type PartGroup, type PartId } from '../editor/parts';
import { placePart, type PlacementResult } from '../editor/placement';
import { CONTROL_MODELS } from '../three/scene/controlModels';

/** What the editor needs from the app around it. */
export interface EditorHost {
  /** Panels go here (the bottom stack, above the dock) and the inspector beside the view. */
  stack: HTMLElement;
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: Camera;
  /** The scene on screen and the 3D scene showing it. */
  scene(): SceneDefinition;
  view(): Scene | null;
  /** Load a model by its file name under models/roads/. */
  model(name: string): Promise<Group>;
  /** Make the edited scene the one on screen (keeps the run if paused). */
  apply(scene: SceneDefinition): Promise<void>;
  /** Editing is allowed in Ready, Paused and Ended, not while traffic is running. */
  canEdit(): boolean;
}

const GHOST_OPACITY = 0.5;
const VALID_COLOUR = '#3772ff';
const INVALID_COLOUR = '#d64545';
const GROUPS: PartGroup[] = ['Roads', 'Curves', 'Junctions', 'Ends', 'Flyovers', 'Controls'];

/**
 * The editor: a Parts drawer, drag-and-drop with a translucent preview that shows exactly
 * where a part would land (the same placement rules as the drop), selection with an
 * inspector (rotate, replace, remove, signal timing), and undo/redo.
 */
export function createEditor(host: EditorHost) {
  let history = new EditHistory(host.scene());
  let rotation: QuarterTurn = 0;
  let selected: { kind: 'piece' | 'control'; index: number } | null = null;

  // ---- Parts drawer ----
  const drawer = document.createElement('section');
  drawer.className = 'parts-drawer';
  drawer.setAttribute('aria-label', 'Parts');
  drawer.hidden = true;
  drawer.innerHTML = `
    <header>
      <h2>Parts</h2>
      <span class="parts-hint">Drag a part onto the map · <kbd>R</kbd> rotates · <kbd>Esc</kbd> cancels</span>
      <button type="button" data-action="rotate" title="Rotate the part (R)">Rotate ⟲</button>
      <button type="button" data-action="undo" title="Undo (Ctrl/⌘ Z)">Undo</button>
      <button type="button" data-action="redo" title="Redo (Ctrl/⌘ ⇧ Z)">Redo</button>
    </header>
    <div class="parts-groups">
      ${GROUPS.map(
        (group) => `<div class="parts-group" role="group" aria-label="${group}"><h3>${group}</h3>${PARTS.filter((p) => p.group === group)
          .map((p) => `<button type="button" class="part" data-part="${p.id}" title="Drag onto the map">${p.label}</button>`)
          .join('')}</div>`,
      ).join('')}
    </div>
  `;
  host.stack.prepend(drawer);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'parts-toggle';
  toggle.textContent = 'Parts';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    toggle.setAttribute('aria-expanded', String(!drawer.hidden));
  });

  // ---- Inspector ----
  const inspector = document.createElement('section');
  inspector.className = 'inspector';
  inspector.setAttribute('aria-label', 'Selected part');
  inspector.hidden = true;
  host.viewport.append(inspector);

  // ---- Status label beside the preview ----
  const reasonLabel = document.createElement('div');
  reasonLabel.className = 'placement-reason';
  reasonLabel.setAttribute('role', 'status');
  reasonLabel.hidden = true;
  host.viewport.append(reasonLabel);

  // ---- 3D helpers: the ghost and the snap highlight ----
  const raycaster = new Raycaster();
  const ghostRoot = new Group();
  ghostRoot.name = 'editor-ghost';
  const highlight = new Mesh(new RingGeometry(0.35 * TILE_SIZE, 0.45 * TILE_SIZE, 32), new MeshBasicMaterial({ color: VALID_COLOUR, depthTest: false, transparent: true }));
  highlight.rotation.x = -Math.PI / 2;
  highlight.renderOrder = 2;
  highlight.visible = false;
  ghostRoot.add(highlight);
  let ghost: Object3D | null = null;
  let ghostMaterials: MeshBasicMaterial[] = [];

  /** Board tiles under the pointer, on the plane at `level` tiles. */
  function boardPoint(event: PointerEvent, level = 0): [number, number] | null {
    const rect = host.canvas.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, host.camera);
    const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -level * TILE_SIZE), new Vector3());
    if (!hit) return null;
    const half = BOARD_TILES / 2;
    return [hit.x / TILE_SIZE + half, hit.z / TILE_SIZE + half];
  }

  async function makeGhost(part: PartId) {
    const def = partById(part);
    const model = await host.model(def.kind === 'control' ? CONTROL_MODELS[part as 'signal' | 'stop' | 'yield'] : PIECES[part].model);
    model.scale.setScalar(TILE_SIZE);
    ghostMaterials = [];
    // Translucent copies of the model's materials, tinted by validity.
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = new MeshBasicMaterial({ color: VALID_COLOUR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
      for (const old of [mesh.material].flat() as Material[]) old.dispose?.();
      mesh.material = material;
      ghostMaterials.push(material);
    });
    return model;
  }

  function showResult(result: PlacementResult, event: PointerEvent) {
    if (!ghost) return;
    const colour = result.valid ? VALID_COLOUR : INVALID_COLOUR;
    for (const m of ghostMaterials) m.color.set(colour);
    if (result.placement) {
      const p = result.placement;
      ghost.position.set(...boardToWorld([p.at[0], p.level ?? 0, p.at[1]]));
      ghost.rotation.y = (p.rotation * Math.PI) / 180;
    } else if (result.snappedTo) {
      ghost.position.set(...boardToWorld(result.snappedTo));
    } else {
      const at = boardPoint(event);
      if (at) ghost.position.set(...boardToWorld([at[0], 0, at[1]]));
    }
    highlight.visible = result.valid && result.snappedTo !== null;
    if (result.snappedTo) highlight.position.set(...boardToWorld(result.snappedTo)).add(new Vector3(0, 0.05, 0));
    // Valid and invalid differ by outline and words as well as colour.
    reasonLabel.hidden = false;
    reasonLabel.className = `placement-reason ${result.valid ? 'valid' : 'invalid'}`;
    reasonLabel.textContent = result.valid ? (result.snappedTo ? '✓ Connects here' : '✓ Place here') : `✕ ${result.reason}`;
    const rect = host.viewport.getBoundingClientRect();
    reasonLabel.style.left = `${event.clientX - rect.left + 16}px`;
    reasonLabel.style.top = `${event.clientY - rect.top + 16}px`;
  }

  // ---- Dragging a part (new, or moving a selected piece) ----
  let drag: { part: PartId; moving: number | null; latest: PlacementResult | null } | null = null;

  function request(event: PointerEvent): PlacementResult | null {
    if (!drag) return null;
    const at = boardPoint(event);
    if (!at) return null;
    const scene = host.scene();
    return drag.moving === null ? placePart(scene, { part: drag.part, pointer: at, rotation }) : movePiece(scene, drag.moving, { pointer: at, rotation });
  }

  async function beginDrag(part: PartId, moving: number | null, event: PointerEvent) {
    if (!host.canEdit()) return;
    drag = { part, moving, latest: null };
    ghost = await makeGhost(part);
    if (!drag) return; // cancelled while loading
    ghostRoot.add(ghost);
    host.view()?.add(ghostRoot);
    document.body.classList.add('placing');
    onMove(event);
  }

  function onMove(event: PointerEvent) {
    if (!drag || !ghost) return;
    drag.latest = request(event);
    if (drag.latest) showResult(drag.latest, event);
  }

  function endDrag() {
    if (ghost) {
      ghostRoot.remove(ghost);
      ghost.traverse((o) => (o as Mesh).geometry?.dispose?.());
    }
    for (const m of ghostMaterials) m.dispose();
    ghost = null;
    ghostMaterials = [];
    highlight.visible = false;
    reasonLabel.hidden = true;
    host.view()?.remove(ghostRoot);
    document.body.classList.remove('placing');
    drag = null;
  }

  async function onUp(event: PointerEvent) {
    if (!drag) return;
    const overMap = event.target === host.canvas;
    const result = overMap ? request(event) : null;
    const moving = drag.moving;
    endDrag();
    // Exactly what the preview showed; an invalid drop (or one off the map) changes nothing.
    if (result?.valid && result.scene) {
      await commit(result.scene);
      if (moving !== null) select({ kind: 'piece', index: result.scene.pieces.length - 1 });
    }
  }

  drawer.addEventListener('pointerdown', (event) => {
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as PartId | undefined;
    if (!part) return;
    event.preventDefault();
    void beginDrag(part, null, event);
  });
  drawer.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'rotate') rotation = (((rotation + 90) % 360) as QuarterTurn);
    if (action === 'undo') void undo();
    if (action === 'redo') void redo();
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', (e) => void onUp(e));
  window.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement)?.closest?.('input, textarea')) return;
    if (event.key === 'Escape' && drag) {
      endDrag();
      return;
    }
    if ((event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey) {
      rotation = (((rotation + 90) % 360) as QuarterTurn);
      if (drag) onMove(lastPointer!);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !drag) void removeSelected();
  });
  let lastPointer: PointerEvent | null = null;
  window.addEventListener('pointermove', (e) => (lastPointer = e), { capture: true });

  // ---- Selecting on the map ----
  let pressed: { x: number; y: number; hit: { kind: 'piece' | 'control'; index: number } | null } | null = null;
  host.canvas.addEventListener('pointerdown', (event) => {
    if (drag || event.button !== 0 || document.body.classList.contains('panning')) return;
    pressed = { x: event.clientX, y: event.clientY, hit: pick(event) };
  });
  host.canvas.addEventListener('pointermove', (event) => {
    // Dragging the selected piece moves it.
    if (!pressed || drag || !host.canEdit()) return;
    const far = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6;
    if (far && pressed.hit?.kind === 'piece' && selected?.kind === 'piece' && selected.index === pressed.hit.index) {
      const part = host.scene().pieces[selected.index].piece as PartId;
      rotation = host.scene().pieces[selected.index].rotation;
      void beginDrag(part, selected.index, event);
      pressed = null;
    }
  });
  host.canvas.addEventListener('pointerup', () => {
    if (!pressed || drag) return;
    select(pressed.hit);
    pressed = null;
  });

  function pick(event: PointerEvent) {
    const view = host.view();
    if (!view) return null;
    const rect = host.canvas.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), host.camera);
    const targets = ['traffic-controls', 'road-pieces'].map((name) => view.getObjectByName(name)).filter((o): o is Object3D => !!o);
    for (const hit of raycaster.intersectObjects(targets, true)) {
      for (let o: Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.controlIndex !== undefined) return { kind: 'control' as const, index: o.userData.controlIndex as number };
        if (o.userData.pieceIndex !== undefined) return { kind: 'piece' as const, index: o.userData.pieceIndex as number };
      }
    }
    return null;
  }

  function select(target: { kind: 'piece' | 'control'; index: number } | null) {
    selected = target && host.canEdit() ? target : null;
    renderInspector();
  }

  function renderInspector() {
    const scene = host.scene();
    if (!selected || (selected.kind === 'piece' && !scene.pieces[selected.index]) || (selected.kind === 'control' && !scene.controls[selected.index])) {
      selected = null;
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    if (selected.kind === 'piece') {
      const piece = scene.pieces[selected.index];
      const part = PARTS.find((p) => p.id === piece.piece);
      const swaps = PARTS.filter((p) => p.kind === 'piece' && p.group === part?.group && p.id !== piece.piece);
      inspector.innerHTML = `
        <header><h2>${part?.label ?? piece.piece}</h2><button type="button" data-action="deselect" aria-label="Clear selection">×</button></header>
        <p class="inspector-hint">Drag it on the map to move it.</p>
        <div class="inspector-actions">
          <button type="button" data-action="rotate-piece">Rotate ⟲</button>
          <button type="button" data-action="remove">Remove</button>
        </div>
        ${swaps.length ? `<label>Replace with <select data-action="replace"><option value="">—</option>${swaps.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></label>` : ''}
        <p class="inspector-error" role="alert" hidden></p>`;
    } else {
      const control = scene.controls[selected.index];
      const timing = control.timing ?? DEFAULT_SIGNAL_TIMING;
      const field = (key: keyof SignalTiming, label: string) =>
        `<label>${label} <input type="number" min="${key === 'offset' ? -300 : 1}" max="300" step="1" value="${timing[key]}" data-timing="${key}"> s</label>`;
      inspector.innerHTML = `
        <header><h2>${partById(control.type).label}</h2><button type="button" data-action="deselect" aria-label="Clear selection">×</button></header>
        ${control.type === 'signal' ? `<div class="timing">${field('green', 'Green')}${field('amber', 'Amber')}${field('red', 'Red')}${field('offset', 'Offset')}</div><button type="button" class="primary" data-action="apply-timing">Apply timing</button>` : ''}
        <div class="inspector-actions"><button type="button" data-action="remove">Remove</button></div>
        <p class="inspector-error" role="alert" hidden></p>`;
    }
  }

  function showError(message: string) {
    const error = inspector.querySelector<HTMLElement>('.inspector-error');
    if (!error) return;
    error.hidden = false;
    error.textContent = message;
  }

  inspector.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action || !selected) return;
    if (action === 'deselect') select(null);
    if (action === 'remove') void removeSelected();
    if (action === 'rotate-piece' && selected.kind === 'piece') {
      const result = rotatePiece(host.scene(), selected.index);
      if (result.valid && result.scene) void commit(result.scene).then(() => select({ kind: 'piece', index: result.scene!.pieces.length - 1 }));
      else showError(result.reason ?? 'Can’t rotate it here');
    }
    if (action === 'apply-timing' && selected.kind === 'control') {
      const value = (key: string) => Number(inspector.querySelector<HTMLInputElement>(`[data-timing="${key}"]`)!.value);
      const timing = { green: value('green'), amber: value('amber'), red: value('red'), offset: value('offset') };
      if (![timing.green, timing.amber, timing.red].every((t) => Number.isFinite(t) && t > 0) || !Number.isFinite(timing.offset)) return showError('Green, amber and red must be more than 0 s');
      const index = selected.index;
      void commit(setSignalTiming(host.scene(), index, timing)).then(() => select({ kind: 'control', index }));
    }
  });
  inspector.addEventListener('change', (event) => {
    const replace = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-action="replace"]');
    if (!replace?.value || selected?.kind !== 'piece') return;
    const result = replacePiece(host.scene(), selected.index, replace.value as PartId);
    if (result.valid && result.scene) void commit(result.scene).then(() => select({ kind: 'piece', index: result.scene!.pieces.length - 1 }));
    else showError(result.reason ?? 'Can’t replace it here');
  });

  async function removeSelected() {
    if (!selected || !host.canEdit()) return;
    const scene = host.scene();
    const edited = selected.kind === 'piece' ? removePiece(scene, selected.index) : removeControl(scene, selected.index);
    select(null);
    await commit(edited);
  }

  // ---- Applying, undo and redo ----
  async function commit(scene: SceneDefinition) {
    history.push(scene);
    await host.apply(scene);
    syncButtons();
  }

  async function undo() {
    if (!host.canEdit()) return;
    const scene = history.undo();
    if (!scene) return;
    select(null);
    await host.apply(scene);
    syncButtons();
  }

  async function redo() {
    if (!host.canEdit()) return;
    const scene = history.redo();
    if (!scene) return;
    select(null);
    await host.apply(scene);
    syncButtons();
  }

  function syncButtons() {
    drawer.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !history.canUndo() || !host.canEdit();
    drawer.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled = !history.canRedo() || !host.canEdit();
  }

  let lockedShown: boolean | null = null;
  return {
    toggle,
    /** Where the part being dragged would land right now (for checks); null when not dragging. */
    preview: () => drag?.latest ?? null,
    /** Select a piece or control as a click would (for checks). */
    select: (target: { kind: 'piece' | 'control'; index: number } | null) => select(target),
    /** A new scene opened: start a fresh history and clear the selection. */
    reset() {
      history = new EditHistory(host.scene());
      select(null);
      endDrag();
      syncButtons();
    },
    /** Call every frame: locks the parts while traffic runs. */
    sync() {
      const locked = !host.canEdit();
      if (locked === lockedShown) return;
      lockedShown = locked;
      for (const button of drawer.querySelectorAll<HTMLButtonElement>('.part')) button.disabled = locked;
      drawer.classList.toggle('locked', locked);
      toggle.title = locked ? 'Pause to edit the map' : 'Parts';
      if (locked) {
        endDrag();
        select(null);
      }
      syncButtons();
    },
  };
}
