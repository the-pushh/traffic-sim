import { Box3, Box3Helper, type Camera, Color, Group, Mesh, MeshBasicMaterial, type Material, type Object3D, Plane, Raycaster, RingGeometry, type Scene, Vector2, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../scenes/board';
import { BOARD_TILES, type ControlPlacement, type QuarterTurn, type SceneDefinition, type SignalTiming } from '../simulation/network/scene';
import { PIECES } from '../simulation/network/pieces';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import { EditHistory, moveControl, movePiece, removeControl, removePiece, replaceControl, replacePiece, rotatePiece, setSignalTiming } from '../editor/edits';
import { PARTS, partById, type PartGroup, type PartId } from '../editor/parts';
import { placePart, type PlacementResult } from '../editor/placement';
import { CONTROL_MODELS } from '../three/scene/controlModels';
import { signPose } from '../three/scene/createSceneView';
import { icon } from '../components/icons';

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
  /**
   * Make the edited scene the one on screen (keeps the run if paused). A new edit's demand
   * is moved to follow the entries it changed; a scene from history is shown as it was.
   */
  apply(scene: SceneDefinition, fromHistory?: boolean): Promise<void>;
  /** Editing is allowed in Ready, Paused and Ended, not while traffic is running. */
  canEdit(): boolean;
}

type Target = { kind: 'piece' | 'control'; index: number };

const GHOST_OPACITY = 0.5;
const VALID_COLOUR = '#3772ff';
const INVALID_COLOUR = '#d64545';
const SELECTED_COLOUR = '#f487b6';
const GROUPS: PartGroup[] = ['Roads', 'Curves', 'Junctions', 'Ends', 'Flyovers', 'Controls'];
/** A press on the map becomes a drag (moving the selection) after this many pixels. */
const DRAG_THRESHOLD = 6;
const CONTROL_TYPES: ControlPlacement['type'][] = ['signal', 'stop', 'yield'];

/** Lanes each part carries, shown with it in the drawer. */
function laneNote(part: PartId) {
  const def = partById(part);
  if (def.kind === 'control') return 'Goes on a junction’s approach';
  if (part === 'support') return 'Holds up a raised ramp';
  if (part === 'split') return 'Two lanes one way meet one lane each way';
  return PIECES[part].ports.length > 2 ? `${PIECES[part].ports.length} arms · one lane each way` : 'One lane each way (follows a one-way road it joins)';
}

/**
 * The editor: a Parts drawer, drag-and-drop with a translucent preview that shows exactly
 * where a part would land (the same placement rules as the drop), keyboard placement,
 * selection with an outline and an inspector (rotate, replace, remove, signal timing),
 * moving by dragging, and undo/redo.
 */
export function createEditor(host: EditorHost) {
  let history = new EditHistory(host.scene());
  let rotation: QuarterTurn = 0;
  let selected: Target | null = null;

  // ---- Parts drawer ----
  const drawer = document.createElement('section');
  drawer.className = 'parts-drawer';
  drawer.setAttribute('aria-label', 'Parts');
  drawer.hidden = true;
  drawer.innerHTML = `
    <header>
      <h2>Parts</h2>
      <span class="parts-hint" id="parts-hint">Drag a part onto the map, or press Enter on one and use the arrow keys · <kbd>R</kbd> rotates · <kbd>Esc</kbd> cancels</span>
      <button type="button" data-action="rotate" title="Rotate the part (R)">Rotate ⟲</button>
      <button type="button" data-action="undo" title="Undo (Ctrl/⌘ Z)">Undo</button>
      <button type="button" data-action="redo" title="Redo (Ctrl/⌘ ⇧ Z)">Redo</button>
    </header>
    <div class="parts-groups">
      ${GROUPS.map(
        (group) => `<div class="parts-group" role="group" aria-label="${group}"><h3>${group}</h3>${PARTS.filter((p) => p.group === group)
          .map((p) => `<button type="button" class="part" data-part="${p.id}" title="${laneNote(p.id)}" aria-describedby="parts-hint">${p.label}</button>`)
          .join('')}</div>`,
      ).join('')}
    </div>
  `;
  host.stack.prepend(drawer);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'parts-toggle';
  toggle.innerHTML = `<span class="parts-toggle-icons">${icon('wrench')}${icon('hammer')}</span><span>Parts</span>`;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    toggle.setAttribute('aria-expanded', String(!drawer.hidden));
  });

  // ---- Inspector and the label beside the preview ----
  const inspector = document.createElement('section');
  inspector.className = 'inspector';
  inspector.setAttribute('aria-label', 'Selected part');
  inspector.hidden = true;
  host.viewport.append(inspector);
  const reasonLabel = document.createElement('div');
  reasonLabel.className = 'placement-reason';
  reasonLabel.setAttribute('role', 'status');
  reasonLabel.hidden = true;
  host.viewport.append(reasonLabel);

  // ---- 3D helpers: the ghost, the snap highlight and the selection outline ----
  const raycaster = new Raycaster();
  const ghostRoot = new Group();
  ghostRoot.name = 'editor-ghost';
  const highlight = new Mesh(new RingGeometry(0.35 * TILE_SIZE, 0.45 * TILE_SIZE, 32), new MeshBasicMaterial({ color: VALID_COLOUR, depthTest: false, transparent: true }));
  highlight.rotation.x = -Math.PI / 2;
  highlight.renderOrder = 2;
  highlight.visible = false;
  ghostRoot.add(highlight);
  const outline = new Box3Helper(new Box3(), new Color(SELECTED_COLOUR));
  outline.name = 'editor-selection';
  outline.renderOrder = 3;
  (outline.material as Material).depthTest = false;
  let outlined: { view: Scene; key: string } | null = null;

  function ndcOf(clientX: number, clientY: number) {
    const rect = host.canvas.getBoundingClientRect();
    return new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Board tiles under a screen point, on the ground plane. */
  function boardPoint(clientX: number, clientY: number): [number, number] | null {
    raycaster.setFromCamera(ndcOf(clientX, clientY), host.camera);
    const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    if (!hit) return null;
    const half = BOARD_TILES / 2;
    return [hit.x / TILE_SIZE + half, hit.z / TILE_SIZE + half];
  }

  async function makeGhost(part: PartId) {
    const def = partById(part);
    const model = await host.model(def.kind === 'control' ? CONTROL_MODELS[part as ControlPlacement['type']] : PIECES[part].model);
    model.scale.setScalar(TILE_SIZE);
    const materials: MeshBasicMaterial[] = [];
    // Translucent copies of the model's materials, tinted by validity.
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = new MeshBasicMaterial({ color: VALID_COLOUR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
      for (const old of [mesh.material].flat() as Material[]) old.dispose?.();
      mesh.material = material;
      materials.push(material);
    });
    return { model, materials };
  }

  // ---- Placing: one drag at a time, driven by the mouse or the keyboard ----
  let drag: {
    part: PartId;
    moving: Target | null;
    /** Board tiles the part is aimed at, and whether that's over the map (not a panel). */
    pointer: [number, number] | null;
    overMap: boolean;
    /** Where the mouse is; null when placing with the keyboard. */
    screen: { x: number; y: number } | null;
    latest: PlacementResult | null;
    ghost: { model: Object3D; materials: MeshBasicMaterial[] } | null;
  } | null = null;

  function compute() {
    if (!drag?.pointer) return null;
    const scene = host.scene();
    if (drag.moving?.kind === 'piece') return movePiece(scene, drag.moving.index, { pointer: drag.pointer, rotation });
    if (drag.moving?.kind === 'control') return moveControl(scene, drag.moving.index, { pointer: drag.pointer });
    return placePart(scene, { part: drag.part, pointer: drag.pointer, rotation });
  }

  function update() {
    if (!drag?.ghost) return;
    const { model, materials } = drag.ghost;
    if (!drag.overMap || !drag.pointer) {
      model.visible = false;
      highlight.visible = false;
      drag.latest = null;
      showLabel('Drop it on the map', false);
      return;
    }
    const result = (drag.latest = compute());
    if (!result) return;
    model.visible = true;
    for (const m of materials) m.color.set(result.valid ? VALID_COLOUR : INVALID_COLOUR);
    if (result.placement) {
      const p = result.placement;
      model.position.set(...boardToWorld([p.at[0], p.level ?? 0, p.at[1]]));
      model.rotation.y = (p.rotation * Math.PI) / 180;
    } else if (result.control && result.scene) {
      // Exactly where and how the sign will stand.
      const pose = signPose(result.scene.pieces, result.control);
      model.position.copy(pose.position);
      model.rotation.y = pose.rotationY;
    } else {
      model.position.set(...boardToWorld([drag.pointer[0], 0, drag.pointer[1]]));
    }
    highlight.visible = result.valid && result.snappedTo !== null;
    if (result.snappedTo) highlight.position.set(...boardToWorld(result.snappedTo)).add(new Vector3(0, 0.05, 0));
    // Valid and invalid differ by outline and words as well as colour.
    showLabel(result.valid ? (result.snappedTo ? '✓ Connects here' : '✓ Place here') : `✕ ${result.reason}`, result.valid);
  }

  function showLabel(text: string, valid: boolean) {
    reasonLabel.hidden = false;
    reasonLabel.className = `placement-reason ${valid ? 'valid' : 'invalid'}`;
    reasonLabel.textContent = text;
    const rect = host.viewport.getBoundingClientRect();
    const at = drag?.screen ?? (drag?.pointer ? screenOf(drag.pointer) : null);
    if (at) {
      reasonLabel.style.left = `${at.x - rect.left + 16}px`;
      reasonLabel.style.top = `${at.y - rect.top + 16}px`;
    }
  }

  function screenOf([x, z]: [number, number]) {
    const p = new Vector3(...boardToWorld([x, 0, z])).project(host.camera);
    const rect = host.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  async function beginDrag(part: PartId, moving: Target | null, start: { pointer: [number, number] | null; screen: { x: number; y: number } | null; overMap: boolean }) {
    if (!host.canEdit()) return;
    cancelDrag();
    const mine: NonNullable<typeof drag> = { part, moving, pointer: start.pointer, overMap: start.overMap, screen: start.screen, latest: null, ghost: null };
    drag = mine;
    const ghost = await makeGhost(part);
    if (drag !== mine) {
      // A newer drag (or a cancel) came along while this one loaded.
      ghost.materials.forEach((m) => m.dispose());
      return;
    }
    mine.ghost = ghost;
    ghostRoot.add(ghost.model);
    host.view()?.add(ghostRoot);
    document.body.classList.add('placing');
    update();
  }

  function cancelDrag() {
    if (drag?.ghost) {
      ghostRoot.remove(drag.ghost.model);
      drag.ghost.materials.forEach((m) => m.dispose());
    }
    highlight.visible = false;
    reasonLabel.hidden = true;
    ghostRoot.parent?.remove(ghostRoot);
    document.body.classList.remove('placing');
    drag = null;
  }

  /** Drop exactly what the preview shows now; an invalid preview, or none, changes nothing. */
  async function drop() {
    if (!drag) return;
    const result = drag.overMap ? drag.latest : null;
    const moving = drag.moving;
    cancelDrag();
    if (!result?.valid || !result.scene) return;
    await commit(result.scene);
    if (moving?.kind === 'piece') select({ kind: 'piece', index: result.scene.pieces.length - 1 });
    if (moving?.kind === 'control') select({ kind: 'control', index: result.scene.controls.length - 1 });
  }

  drawer.addEventListener('pointerdown', (event) => {
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as PartId | undefined;
    if (!part) return;
    event.preventDefault();
    // Let the pointer's later events go to whatever is under it (touch and pen capture by default).
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    void beginDrag(part, null, { pointer: null, screen: { x: event.clientX, y: event.clientY }, overMap: false });
  });
  // Keyboard: Enter or Space on a part aims it at the middle of the map; arrows move it a tile; Enter drops.
  drawer.addEventListener('keydown', (event) => {
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as PartId | undefined;
    if (!part || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (drag) return void drop();
    void beginDrag(part, null, { pointer: [BOARD_TILES / 2, BOARD_TILES / 2], screen: null, overMap: true });
  });
  drawer.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'rotate') rotate();
    if (action === 'undo') void undo();
    if (action === 'redo') void redo();
  });

  function rotate() {
    rotation = (((rotation + 90) % 360) as QuarterTurn);
    update();
  }

  window.addEventListener('pointermove', (event) => {
    if (!drag || !drag.screen) return;
    drag.screen = { x: event.clientX, y: event.clientY };
    drag.overMap = event.target === host.canvas;
    if (drag.overMap) drag.pointer = boardPoint(event.clientX, event.clientY);
    update();
  });
  window.addEventListener('pointerup', () => {
    if (drag?.screen) void drop();
  });
  window.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement)?.closest?.('input, textarea, select')) return;
    if (event.key === 'Escape' && drag) return cancelDrag();
    if ((event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey) return rotate();
    if (drag?.pointer && !drag.screen) {
      const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const step = steps[event.key];
      if (step) {
        event.preventDefault();
        const clamp = (v: number) => Math.min(BOARD_TILES - 0.5, Math.max(0.5, v));
        drag.pointer = [clamp(drag.pointer[0] + step[0]), clamp(drag.pointer[1] + step[1])];
        update();
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !drag) void removeSelected();
  });

  // ---- Selecting on the map, and dragging the selection to move it ----
  let pressed: { x: number; y: number; hit: Target | null } | null = null;
  host.canvas.addEventListener('pointerdown', (event) => {
    if (drag || event.button !== 0 || 'spaceHeld' in host.canvas.dataset) return;
    pressed = { x: event.clientX, y: event.clientY, hit: pick(event) };
  });
  host.canvas.addEventListener('pointermove', (event) => {
    if (!pressed || drag || !host.canEdit()) return;
    const far = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > DRAG_THRESHOLD;
    const hit = pressed.hit;
    if (!far || !hit || !selected || hit.kind !== selected.kind || hit.index !== selected.index) return;
    const scene = host.scene();
    const part = (hit.kind === 'piece' ? scene.pieces[hit.index].piece : scene.controls[hit.index].type) as PartId;
    if (hit.kind === 'piece') rotation = scene.pieces[hit.index].rotation;
    pressed = null;
    void beginDrag(part, hit, { pointer: boardPoint(event.clientX, event.clientY), screen: { x: event.clientX, y: event.clientY }, overMap: true });
  });
  host.canvas.addEventListener('pointerup', () => {
    if (!pressed || drag) return;
    select(pressed.hit);
    pressed = null;
  });

  function pick(event: PointerEvent): Target | null {
    const view = host.view();
    if (!view) return null;
    raycaster.setFromCamera(ndcOf(event.clientX, event.clientY), host.camera);
    const targets = ['traffic-controls', 'road-pieces'].map((name) => view.getObjectByName(name)).filter((o): o is Object3D => !!o);
    for (const hit of raycaster.intersectObjects(targets, true)) {
      for (let o: Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.controlIndex !== undefined) return { kind: 'control', index: o.userData.controlIndex as number };
        if (o.userData.pieceIndex !== undefined) return { kind: 'piece', index: o.userData.pieceIndex as number };
      }
    }
    return null;
  }

  function select(target: Target | null) {
    selected = target && host.canEdit() ? target : null;
    renderInspector();
    showOutline();
  }

  /** Outline the selected piece or sign on the map, against light and dark ground alike. */
  function showOutline() {
    const view = host.view();
    const key = selected ? `${selected.kind}:${selected.index}` : '';
    if (outlined && (outlined.view !== view || outlined.key !== key)) {
      outlined.view.remove(outline);
      outlined = null;
    }
    if (!selected || !view || outlined) return;
    const target = selected;
    const group = view.getObjectByName(target.kind === 'piece' ? 'road-pieces' : 'traffic-controls');
    const object = group?.children.find((o) => o.userData[target.kind === 'piece' ? 'pieceIndex' : 'controlIndex'] === target.index);
    if (!object) return;
    outline.box.setFromObject(object).expandByScalar(0.15);
    view.add(outline);
    outlined = { view, key };
  }

  function renderInspector() {
    const scene = host.scene();
    if (!selected || (selected.kind === 'piece' && !scene.pieces[selected.index]) || (selected.kind === 'control' && !scene.controls[selected.index])) {
      selected = null;
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    const header = (title: string) => `<header><h2>${title}</h2><button type="button" data-action="deselect" aria-label="Clear selection">×</button></header>`;
    if (selected.kind === 'piece') {
      const piece = scene.pieces[selected.index];
      const part = PARTS.find((p) => p.id === piece.piece);
      const swaps = PARTS.filter((p) => p.kind === 'piece' && p.group === part?.group && p.id !== piece.piece);
      inspector.innerHTML = `
        ${header(part?.label ?? piece.piece)}
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
        ${header(partById(control.type).label)}
        <p class="inspector-hint">Drag it on the map to move it to another approach.</p>
        ${control.type === 'signal' ? `<div class="timing">${field('green', 'Green')}${field('amber', 'Amber')}${field('red', 'Red')}${field('offset', 'Offset')}</div><button type="button" class="primary" data-action="apply-timing">Apply timing</button>` : ''}
        <label>Replace with <select data-action="replace-control"><option value="">—</option>${CONTROL_TYPES.filter((t) => t !== control.type)
          .map((t) => `<option value="${t}">${partById(t).label}</option>`)
          .join('')}</select></label>
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
    const choice = event.target as HTMLSelectElement;
    if (!choice.value || !selected) return;
    if (choice.dataset.action === 'replace' && selected.kind === 'piece') {
      const result = replacePiece(host.scene(), selected.index, choice.value as PartId);
      if (result.valid && result.scene) void commit(result.scene).then(() => select({ kind: 'piece', index: result.scene!.pieces.length - 1 }));
      else showError(result.reason ?? 'Can’t replace it here');
    }
    if (choice.dataset.action === 'replace-control' && selected.kind === 'control') {
      const index = selected.index;
      void commit(replaceControl(host.scene(), index, choice.value as ControlPlacement['type'])).then(() => select({ kind: 'control', index }));
    }
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
    await host.apply(scene);
    // Remember the scene as it was applied (with its demand following the entries).
    history.push(host.scene());
    syncButtons();
  }

  async function step(direction: 'undo' | 'redo') {
    if (!host.canEdit()) return;
    const scene = direction === 'undo' ? history.undo() : history.redo();
    if (!scene) return;
    select(null);
    await host.apply(scene, true);
    syncButtons();
  }
  const undo = () => step('undo');
  const redo = () => step('redo');

  function syncButtons() {
    drawer.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !history.canUndo() || !host.canEdit();
    drawer.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled = !history.canRedo() || !host.canEdit();
  }

  let lockedShown: boolean | null = null;
  return {
    toggle,
    /** Where the part being placed would land right now (for checks); null when not placing. */
    preview: () => drag?.latest ?? null,
    /** Select a piece or control as a click would (for checks). */
    select: (target: Target | null) => select(target),
    /** A new scene opened: start a fresh history and clear the selection. */
    reset() {
      history = new EditHistory(host.scene());
      cancelDrag();
      select(null);
      syncButtons();
    },
    /** Call every frame: locks the parts while traffic runs, and keeps the outline and preview on the current view. */
    sync() {
      showOutline();
      if (drag?.ghost && !ghostRoot.parent) host.view()?.add(ghostRoot);
      const locked = !host.canEdit();
      if (locked === lockedShown) return;
      lockedShown = locked;
      for (const button of drawer.querySelectorAll<HTMLButtonElement>('.part')) button.disabled = locked;
      drawer.classList.toggle('locked', locked);
      toggle.title = locked ? 'Pause to edit the map' : 'Parts';
      if (locked) {
        cancelDrag();
        select(null);
      }
      syncButtons();
    },
  };
}
