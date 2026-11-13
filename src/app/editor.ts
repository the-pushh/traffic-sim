import { Box3, Box3Helper, type Camera, Color, Group, Mesh, MeshBasicMaterial, type Material, type Object3D, Plane, Raycaster, RingGeometry, type Scene, Vector2, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../scenes/board';
import { BOARD_TILES, type ControlPlacement, type QuarterTurn, type SceneDefinition, type SignalTiming } from '../simulation/network/scene';
import { PIECES } from '../simulation/network/pieces';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import { EditHistory, moveControl, movePiece, removeControl, removePiece, replaceControl, replacePiece, rotatePiece, setSignalTiming } from '../editor/edits';
import { PARTS, partById, type PartGroup, type PartId } from '../editor/parts';
import { placePart, type PlacementResult } from '../editor/placement';
import { placementKeyAction, type PlacingMode } from '../editor/placementKeys';
import { CONTROL_MODELS } from '../three/scene/controlModels';
import { signPose } from '../three/scene/createSceneView';
import { icon } from '../components/icons';
import { renderThumbnails } from '../three/thumbnails/partThumbnails';

/** What the editor needs from the app around it. */
export interface EditorHost {
  /** A click on the map: open the card of a vehicle under it, if any (true), before looking for a road piece. */
  inspectVehicleAt?(event: PointerEvent): boolean;
  /** The Parts tray (bottom-right) and the inspector (top-left) sit over the view. */
  viewport: HTMLElement;
  /** Panels the tray keeps clear of: the camera panel above it, the dock beside or below. */
  cameraPanel: HTMLElement;
  dock: HTMLElement;
  /** The tray opened, closed or moved: the view re-centres in the space it leaves. */
  trayToggled(): void;
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

/** What the preview says a drop makes when it joins a road's side. */
const JUNCTION_NAMES: Record<string, string> = { 't-junction': 'a T-junction', crossroad: 'a crossroads', bend: 'a bend' };

/** Remembers in this browser that the Space-to-turn tip has been shown. */
const SPACE_TIP_KEY = 'traffic-sim:space-turns-tip-seen';

/**
 * A tip shown during the first placement only: `start` when a placement begins (it shows if
 * never seen), `finish` when it ends (then it's remembered as seen).
 */
function createOnceTip(key: string) {
  const seen = () => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  const tip = {
    /** This placement may show the tip; `shown` once it actually has. */
    showing: false,
    shown: false,
    start() {
      tip.showing = !seen();
      tip.shown = false;
    },
    finish() {
      const wasShown = tip.shown;
      tip.showing = tip.shown = false;
      if (!wasShown) return;
      try {
        localStorage.setItem(key, '1');
      } catch {
        // Blocked storage: the tip shows again next visit, which is harmless.
      }
    },
  };
  return tip;
}

/** The model file a part is shown with. */
const partModel = (part: PartId) => (partById(part).kind === 'control' ? CONTROL_MODELS[part as ControlPlacement['type']] : PIECES[part].model);

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
  drawer.setAttribute('aria-label', 'Components');
  drawer.hidden = true;
  drawer.innerHTML = `
    <header>
      <h2>Components</h2>
      <span class="parts-hint" id="parts-hint">Drag a component onto the map<span class="visually-hidden">, or press Enter on one and use the arrow keys; Space or R turns it, Enter drops it, Escape cancels</span></span>
    </header>
    <div class="parts-groups">
      ${GROUPS.map(
        (group) => `<div class="parts-group" role="group" aria-label="${group}"><h3>${group}</h3>${PARTS.filter((p) => p.group === group)
          .map(
            (p) =>
              `<button type="button" class="part" data-part="${p.id}" title="${laneNote(p.id)}" aria-describedby="parts-hint"><span class="part-picture" aria-hidden="true"></span><span class="part-label">${p.label}</span></button>`,
          )
          .join('')}</div>`,
      ).join('')}
    </div>
  `;
  // The tray sits bottom-right over the map, clear of the dock, so the map stays in view.
  host.viewport.append(drawer);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'parts-toggle';
  toggle.innerHTML = `${icon('toolsCrossed')}<span>Customise</span>`;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    toggle.setAttribute('aria-expanded', String(!drawer.hidden));
    if (!drawer.hidden) {
      placeTray();
      showPictures();
    }
    host.trayToggled();
  });
  window.addEventListener('resize', () => {
    if (drawer.hidden) return;
    placeTray();
    host.trayToggled();
  });

  /**
   * Fit the tray in the bottom-right corner: under the camera panel, and beside the dock
   * when there's room, otherwise above the dock's top edge.
   */
  function placeTray() {
    const area = host.viewport.getBoundingClientRect();
    const camera = host.cameraPanel.getBoundingClientRect();
    const dock = host.dock.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(drawer).right) || 0;
    const besideDock = area.right - gap - drawer.offsetWidth > dock.right + gap;
    drawer.style.setProperty('--tray-top', `${camera.bottom - area.top + gap}px`);
    drawer.style.setProperty('--tray-bottom', besideDock ? `${gap}px` : `${area.bottom - dock.top + gap}px`);
  }

  // Pictures of the parts, drawn the first time the tray opens (not at start-up).
  let picturesDrawn = false;
  function showPictures() {
    if (picturesDrawn) return;
    picturesDrawn = true;
    void renderThumbnails(
      PARTS.map((p) => p.id),
      (id) => host.model(partModel(id)),
      (id, url) => {
        const slot = drawer.querySelector<HTMLElement>(`[data-part="${id}"] .part-picture`);
        if (slot) slot.style.backgroundImage = `url("${url}")`;
        drawer.classList.add('pictured');
      },
    );
  }

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
  const spaceTip = createOnceTip(SPACE_TIP_KEY);

  // ---- 3D helpers: the ghost, the snap highlight and the selection outline ----
  const raycaster = new Raycaster();
  const ghostRoot = new Group();
  ghostRoot.name = 'editor-ghost';
  const highlight = new Mesh(new RingGeometry(0.35 * TILE_SIZE, 0.45 * TILE_SIZE, 32), new MeshBasicMaterial({ color: VALID_COLOUR, depthTest: false, transparent: true }));
  highlight.rotation.x = -Math.PI / 2;
  highlight.renderOrder = 2;
  highlight.visible = false;
  ghostRoot.add(highlight);
  // Pieces a drop would turn into junctions (and the new piece, when it becomes one), shown as they'll be.
  const joinGhosts = new Group();
  joinGhosts.name = 'editor-join-ghosts';
  ghostRoot.add(joinGhosts);
  const joinMaterial = new MeshBasicMaterial({ color: VALID_COLOUR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
  // Lives as long as the editor (the whole session): one material shared by every join ghost.
  const loadedModels = new Map<string, Object3D | 'loading' | 'failed'>();
  /** A translucent copy of a piece's model, or null while it loads or if it couldn't (the preview updates once it has). */
  function joinGhost(piece: string): Object3D | null {
    const name = PIECES[piece].model;
    const loaded = loadedModels.get(name);
    if (loaded === 'loading' || loaded === 'failed') return null;
    if (!loaded) {
      loadedModels.set(name, 'loading');
      void host.model(name).then(
        (model) => {
          loadedModels.set(name, model);
          update();
        },
        () => loadedModels.set(name, 'failed'), // the dragged part's own ghost stands in
      );
      return null;
    }
    const copy = loaded.clone();
    copy.scale.setScalar(TILE_SIZE);
    copy.traverse((object) => {
      if ((object as Mesh).isMesh) (object as Mesh).material = joinMaterial;
    });
    return copy;
  }
  /** Show the junctions a drop would make, exactly where they'll be; true when the new piece itself becomes one. */
  function showJoins(result: PlacementResult): boolean {
    joinGhosts.clear();
    let newPieceGrown = false;
    if (!result.valid || !result.scene || !result.joins) return false;
    for (const join of result.joins) {
      const p = result.scene.pieces[join.index];
      const ghost = joinGhost(p.piece);
      if (!ghost) continue;
      // Only once its junction shape is showing does it replace the dragged part's ghost.
      if (join.index === result.scene.pieces.length - 1) newPieceGrown = true;
      ghost.position.set(...boardToWorld([p.at[0], p.level ?? 0, p.at[1]]));
      ghost.rotation.y = (p.rotation * Math.PI) / 180;
      joinGhosts.add(ghost);
    }
    return newPieceGrown;
  }
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
    // A copy of the shared, cached model: its geometry is shared, its materials are swapped.
    const model = (await host.model(partModel(part))).clone();
    model.scale.setScalar(TILE_SIZE);
    const materials: MeshBasicMaterial[] = [];
    // Translucent copies of the model's materials, tinted by validity.
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = new MeshBasicMaterial({ color: VALID_COLOUR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
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
    // When the new piece itself becomes a junction, its junction ghost stands in for it.
    model.visible = !showJoins(result);
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
    showLabel(result.valid ? (result.joins ? `✓ Makes ${JUNCTION_NAMES[result.joins.at(-1)!.to] ?? 'a junction'}` : result.snappedTo ? '✓ Connects here' : '✓ Place here') : `✕ ${result.reason}`, result.valid);
  }

  function showLabel(text: string, valid: boolean) {
    reasonLabel.hidden = false;
    reasonLabel.className = `placement-reason ${valid ? 'valid' : 'invalid'}`;
    reasonLabel.textContent = text;
    if (spaceTip.showing && drag && partById(drag.part).kind === 'piece') {
      spaceTip.shown = true;
      const tip = document.createElement('span');
      tip.className = 'placement-tip';
      tip.innerHTML = 'Press <kbd>Space</kbd> to turn it';
      reasonLabel.append(tip);
    }
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
    spaceTip.start();
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
    joinGhosts.clear();
    reasonLabel.hidden = true;
    ghostRoot.parent?.remove(ghostRoot);
    document.body.classList.remove('placing');
    if (drag) spaceTip.finish();
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
    // A new or moved piece is selected, so its rotate button shows on it straight away.
    if (!moving && result.placement) select({ kind: 'piece', index: result.scene.pieces.length - 1 });
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
  // Keyboard: Enter or Space on a part aims it at the middle of the map; arrows move it a tile, Space or R turns it, Enter drops.
  drawer.addEventListener('keydown', (event) => {
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as PartId | undefined;
    if (!part || drag || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
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
  // Placement keys go first (capture phase): while a part is being placed, Space turns it
  // instead of panning the map, and Enter drops it rather than pressing a focused button.
  window.addEventListener(
    'keydown',
    (event) => {
      if ((event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const mode: PlacingMode = !drag ? 'idle' : drag.screen ? 'dragging' : 'keyboard';
      const action = placementKeyAction(event, mode);
      // With nothing being placed, R just sets the turn for the next part; the key carries on as usual.
      if (mode === 'idle') return void (action === 'rotate' && rotate());
      // A held Space while placing does nothing, but mustn't start a pan either.
      if (!action && event.key !== ' ') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'rotate') rotate();
      if (action === 'drop') void drop();
      if (action === 'cancel') cancelDrag();
    },
    { capture: true },
  );
  window.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement)?.closest?.('input, textarea, select')) return;
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
  /** A press on the map; `moved` once it went past the drag threshold at any point (then it's not a click). */
  let pressed: { x: number; y: number; hit: Target | null; moved: boolean } | null = null;
  host.canvas.addEventListener('pointerdown', (event) => {
    if (drag || event.button !== 0 || 'spaceHeld' in host.canvas.dataset) return;
    pressed = { x: event.clientX, y: event.clientY, hit: pick(event), moved: false };
  });
  host.canvas.addEventListener('pointermove', (event) => {
    if (!pressed || drag) return;
    const far = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > DRAG_THRESHOLD;
    if (far) pressed.moved = true;
    if (!host.canEdit()) return;
    const hit = pressed.hit;
    if (!far || !hit || !selected || hit.kind !== selected.kind || hit.index !== selected.index) return;
    const scene = host.scene();
    const part = (hit.kind === 'piece' ? scene.pieces[hit.index].piece : scene.controls[hit.index].type) as PartId;
    if (hit.kind === 'piece') rotation = scene.pieces[hit.index].rotation;
    pressed = null;
    void beginDrag(part, hit, { pointer: boardPoint(event.clientX, event.clientY), screen: { x: event.clientX, y: event.clientY }, overMap: true });
  });
  host.canvas.addEventListener('pointerup', (event) => {
    if (!pressed || drag) return;
    // A press that moved (at any point) turned the camera: it isn't a click, so the selection stays.
    const moved = pressed.moved || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > DRAG_THRESHOLD;
    // A vehicle under the click takes the card (the road inspector closes); otherwise select as usual.
    if (!moved) select(host.inspectVehicleAt?.(event) ? null : pressed.hit);
    pressed = null;
  });

  /** Whether a press lands on the selected piece or control (its drag moves it; any other drag turns the camera). */
  function pressStartsOnSelection(event: PointerEvent): boolean {
    if (!selected || !host.canEdit() || drag) return false;
    const hit = pick(event);
    return !!hit && hit.kind === selected.kind && hit.index === selected.index;
  }

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
  /** Keep the selection outline on the selected thing; true when it changed (the view needs drawing). */
  function showOutline(): boolean {
    const view = host.view();
    const key = selected ? `${selected.kind}:${selected.index}` : '';
    let changed = false;
    if (outlined && (outlined.view !== view || outlined.key !== key)) {
      outlined.view.remove(outline);
      outlined = null;
      changed = true;
    }
    if (!selected || !view || outlined) return changed;
    const target = selected;
    const group = view.getObjectByName(target.kind === 'piece' ? 'road-pieces' : 'traffic-controls');
    const object = group?.children.find((o) => o.userData[target.kind === 'piece' ? 'pieceIndex' : 'controlIndex'] === target.index);
    if (!object) return changed;
    outline.box.setFromObject(object).expandByScalar(0.15);
    view.add(outline);
    outlined = { view, key };
    return true;
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
    if (action === 'rotate-piece' && selected.kind === 'piece') rotateAt(selected.index);
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
  /** Turn a placed piece a quarter (as the inspector's Rotate does) and keep it selected. */
  function rotateAt(index: number) {
    const result = rotatePiece(host.scene(), index);
    if (result.valid && result.scene) void commit(result.scene).then(() => select({ kind: 'piece', index: result.scene!.pieces.length - 1 }));
    else showError(result.reason ?? 'Can’t rotate it here');
  }

  // ---- A rotate button on the piece itself: over the selected piece, or the one under the pointer ----
  const pieceRotate = document.createElement('button');
  pieceRotate.type = 'button';
  pieceRotate.className = 'icon-button piece-rotate';
  pieceRotate.setAttribute('aria-label', 'Rotate this piece');
  pieceRotate.title = 'Rotate (R)';
  pieceRotate.innerHTML = icon('rotate');
  pieceRotate.hidden = true;
  host.viewport.append(pieceRotate);
  /** The piece under the pointer, kept a moment after the pointer leaves it so the button can be reached. */
  let hovered: { index: number; until: number } | null = null;
  const HOVER_GRACE_MS = 700;
  host.canvas.addEventListener('pointermove', (event) => {
    if (drag || pressed || !host.canEdit()) return;
    const hit = pick(event);
    if (hit?.kind === 'piece') hovered = { index: hit.index, until: Infinity };
    else if (hovered?.until === Infinity) hovered.until = performance.now() + HOVER_GRACE_MS;
  });
  pieceRotate.addEventListener('pointerenter', () => hovered && (hovered.until = Infinity));
  pieceRotate.addEventListener('pointerleave', () => hovered && (hovered.until = performance.now() + HOVER_GRACE_MS));
  pieceRotate.addEventListener('click', () => {
    const index = selected?.kind === 'piece' ? selected.index : hovered?.index;
    if (index !== undefined) rotateAt(index);
  });
  /** Keep the button just above its piece on screen (the camera may move), or hide it. */
  function placeRotateButton() {
    if (hovered && hovered.until < performance.now()) hovered = null;
    const index = drag || !host.canEdit() ? undefined : selected?.kind === 'piece' ? selected.index : hovered?.index;
    const piece = index === undefined ? undefined : host.scene().pieces[index];
    if (!piece) {
      pieceRotate.hidden = true;
      return;
    }
    const p = new Vector3(...boardToWorld([piece.at[0], piece.level ?? 0, piece.at[1]])).project(host.camera);
    const rect = host.canvas.getBoundingClientRect();
    const area = host.viewport.getBoundingClientRect();
    pieceRotate.style.left = `${rect.left - area.left + ((p.x + 1) / 2) * rect.width}px`;
    pieceRotate.style.top = `${rect.top - area.top + ((1 - p.y) / 2) * rect.height}px`;
    pieceRotate.hidden = false;
  }

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

  /** Undo and redo buttons, when the tray has them (undo and redo also work from the keyboard). */
  function syncButtons() {
    const undoButton = drawer.querySelector<HTMLButtonElement>('[data-action="undo"]');
    const redoButton = drawer.querySelector<HTMLButtonElement>('[data-action="redo"]');
    if (undoButton) undoButton.disabled = !history.canUndo() || !host.canEdit();
    if (redoButton) redoButton.disabled = !history.canRedo() || !host.canEdit();
  }

  let wasPlacing = false;
  let lockedShown: boolean | null = null;
  return {
    toggle,
    pressStartsOnSelection,
    /** The parts tray (the app centres the view beside it while it's open). */
    tray: drawer,
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
    /** Call every frame; true when the editor changed what the map shows (a part being placed, the outline). */
    sync(): boolean {
      placeRotateButton();
      const placing = drag !== null;
      const changed = showOutline() || placing || wasPlacing;
      wasPlacing = placing; // one more frame after placing ends, to clear the preview
      if (drag?.ghost && !ghostRoot.parent) host.view()?.add(ghostRoot);
      const locked = !host.canEdit();
      if (locked === lockedShown) return changed;
      lockedShown = locked;
      for (const button of drawer.querySelectorAll<HTMLButtonElement>('.part')) button.disabled = locked;
      drawer.classList.toggle('locked', locked);
      toggle.title = locked ? 'Pause to edit the map' : 'Customise the map';
      if (locked) {
        cancelDrag();
        select(null);
      }
      syncButtons();
      return true;
    },
  };
}
