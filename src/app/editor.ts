import { Box3, Box3Helper, type Camera, Color, Group, Mesh, MeshBasicMaterial, type Material, type Object3D, Plane, Raycaster, RingGeometry, type Scene, Vector2, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../scenes/board';
import { BOARD_TILES, type ControlPlacement, type QuarterTurn, type SceneDefinition, type SignalTiming } from '../simulation/network/scene';
import { PIECES } from '../simulation/network/pieces';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import type { Effect } from '../audio/soundBoard';
import { type BoardPoint, connectionChange } from '../editor/connections';
import { EditHistory, moveControl, movePiece, removeControl, removePiece, replaceControl, replacePiece, rotatePiece, setSignalTiming, turnPiece } from '../editor/edits';
import { replacementsFor } from '../editor/replacements';
import { turnedRotation } from '../editor/rotateHandle';
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
  /** Pause a running run (opening Customise does, so traffic stays still while the layout changes). */
  pause(): void;
  /** A successful edit's sound: placed, turned or removed (quiet when sound is off). */
  sound(kind: Effect): void;
}

type Target = { kind: 'piece' | 'control'; index: number };

const GHOST_OPACITY = 0.5;
const VALID_COLOUR = '#3772ff';
const INVALID_COLOUR = '#d64545';
/** The selection, the rotation handle and kept connections share the HUD's blue accent. */
const SELECTED_COLOUR = '#3772ff';
const REMOVE_COLOUR = '#d64545';
/** How long "Road removed · Undo" stays up, ms. */
const TOAST_MS = 6000;
/** The rotation handle's ring: this far beyond the piece's footprint, tiles; its grip spans this much of it, radians. */
const HANDLE_GAP = 0.3;
const GRIP_SPAN = (110 * Math.PI) / 180;
/** The ring is at least this wide on screen (px from the piece's centre), so it can be grabbed when zoomed out. */
const HANDLE_MIN_PX = 64;
const SVG_NS = 'http://www.w3.org/2000/svg';
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
      <button type="button" class="tool-toggle" data-action="remove-tool" aria-pressed="false" title="Remove roads and signs one click at a time (Esc to stop)">${icon('eraser')}<span>Remove</span></button>
      <span class="parts-hint" id="parts-hint">Drag a component onto the map, or click it and then click the map<span class="visually-hidden">; or press Enter on one and use the arrow keys; Space or R turns it, Enter drops it, Escape cancels</span></span>
    </header>
    <section class="parts-replace" aria-label="Replacements" hidden></section>
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
  toggle.innerHTML = `${icon('wrench')}<span>Customise</span>`;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    // Customise pauses a running run: traffic stays still while the layout changes.
    if (drawer.hidden && !host.canEdit()) host.pause();
    drawer.hidden = !drawer.hidden;
    if (drawer.hidden) {
      setRemoveTool(false);
      closeReplace();
      cancelDrag();
    }
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
    /** Clicked rather than dragged: each click on the map places one, until Escape or another tool. */
    armed: boolean;
  } | null = null;
  /** A press on the map while a part is armed: a click places it, a drag turns the view. */
  let armedPress: { x: number; y: number } | null = null;

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
      if (drag.armed) showLabel('Click the map to place it · Esc to stop', true);
      else showLabel('Drop it on the map', false);
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

  /** The label beside the pointer (or a point on the viewport): ✓ in blue, ✕ in red with a dashed edge. */
  function showLabelAt(text: string, valid: boolean, at: { x: number; y: number }) {
    reasonLabel.hidden = false;
    reasonLabel.className = `placement-reason ${valid ? 'valid' : 'invalid'}`;
    reasonLabel.textContent = text;
    // Clear of the pointer and the handle's knob under it.
    reasonLabel.style.left = `${at.x + 30}px`;
    reasonLabel.style.top = `${at.y + 26}px`;
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
    setRemoveTool(false);
    closeReplace();
    const mine: NonNullable<typeof drag> = { part, moving, pointer: start.pointer, overMap: start.overMap, screen: start.screen, latest: null, ghost: null, armed: false };
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
    document.body.classList.remove('placing', 'stamping');
    for (const tile of drawer.querySelectorAll('.part[aria-pressed]')) tile.removeAttribute('aria-pressed');
    if (drag) spaceTip.finish();
    drag = null;
    armedPress = null;
  }

  /** The part was clicked, not dragged: keep it in hand so each click on the map places one (Townscaper-style). */
  function arm() {
    if (!drag) return;
    drag.armed = true;
    document.body.classList.add('stamping');
    drawer.querySelector(`.parts-groups [data-part="${drag.part}"]`)?.setAttribute('aria-pressed', 'true');
    update();
  }

  /** Place the armed part where its preview is; an invalid spot stays quiet (the label says why). */
  async function placeArmed() {
    const result = drag?.overMap ? drag.latest : null;
    if (!result?.valid || !result.scene) return;
    await commit(result.scene);
    host.sound('place');
    // The part stays in hand; its preview now reads the new map.
    update();
  }

  /** Drop exactly what the preview shows now; an invalid preview, or none, changes nothing. */
  async function drop() {
    if (!drag) return;
    const result = drag.overMap ? drag.latest : null;
    const moving = drag.moving;
    cancelDrag();
    if (!result?.valid || !result.scene) return;
    await commit(result.scene);
    host.sound('place');
    // A new or moved piece is selected, so its rotate button shows on it straight away.
    if (!moving && result.placement) select({ kind: 'piece', index: result.scene.pieces.length - 1 });
    if (moving?.kind === 'piece') select({ kind: 'piece', index: result.scene.pieces.length - 1 });
    if (moving?.kind === 'control') select({ kind: 'control', index: result.scene.controls.length - 1 });
  }

  drawer.addEventListener('pointerdown', (event) => {
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part as PartId | undefined;
    if (!part) return;
    event.preventDefault();
    // Clicking the part in hand again puts it down.
    if (drag?.armed && drag.part === part) return cancelDrag();
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
    if (action === 'remove-tool') setRemoveTool(!removeTool);
    if (action === 'replace-cancel') closeReplace();
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
  window.addEventListener('pointerup', (event) => {
    if (!drag?.screen || drag.armed) return;
    // Pressed and let go on the part itself, never over the map: a click, so it's armed for clicking onto the map.
    const onTile = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('.parts-groups [data-part]')?.dataset.part === drag.part;
    if (onTile && drag.pointer === null && !drag.moving) return arm();
    void drop();
  });
  // Placement keys go first (capture phase): while a part is being placed, Space turns it
  // instead of panning the map, and Enter drops it rather than pressing a focused button.
  window.addEventListener(
    'keydown',
    (event) => {
      if ((event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return;
      // Escape backs out of a turn in progress, a replacement being chosen, or the Remove tool, quietly.
      if (event.key === 'Escape' && !drag && (turning || replacing || removeTool)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (turning) {
          turning.cancelled = true;
          clearEditPreview();
          reasonLabel.hidden = true;
        } else if (replacing) closeReplace();
        else setRemoveTool(false);
        return;
      }
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
    if (drag?.armed && event.button === 0 && !('spaceHeld' in host.canvas.dataset)) armedPress = { x: event.clientX, y: event.clientY };
    if (drag || event.button !== 0 || 'spaceHeld' in host.canvas.dataset) return;
    pressed = { x: event.clientX, y: event.clientY, hit: pick(event), moved: false };
  });
  host.canvas.addEventListener('pointermove', (event) => {
    if (removeTool && !pressed) {
      const area = host.viewport.getBoundingClientRect();
      showRemoveHover(pick(event), { x: event.clientX - area.left, y: event.clientY - area.top });
    }
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
    if (armedPress) {
      const click = Math.hypot(event.clientX - armedPress.x, event.clientY - armedPress.y) <= DRAG_THRESHOLD;
      armedPress = null;
      if (click && drag?.armed) void placeArmed();
      return;
    }
    if (!pressed || drag) return;
    // A press that moved (at any point) turned the camera: it isn't a click, so the selection stays.
    const moved = pressed.moved || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > DRAG_THRESHOLD;
    if (removeTool) {
      if (!moved && pressed.hit) void removeTarget(pressed.hit);
      pressed = null;
      return;
    }
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
    if (replacing && (selected?.kind !== 'piece' || selected.index !== replacing.index)) closeReplace();
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
      inspector.innerHTML = `
        ${header(part?.label ?? piece.piece)}
        <p class="inspector-hint">Drag it to move it; drag the ring round it to turn it.</p>
        <div class="inspector-actions">
          <button type="button" data-action="rotate-piece">${icon('rotate')}Rotate</button>
          <button type="button" data-action="replace-open" aria-pressed="${!!replacing}">Replace…</button>
          <button type="button" class="danger" data-action="remove">${icon('trash')}Remove</button>
        </div>
        ${replacing ? replaceConfirm() : ''}
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

  /** While replacing: what the previewed part would do, with Replace and Cancel (the original stays until Replace). */
  function replaceConfirm() {
    const preview = editPreview?.kind === 'replace' ? editPreview : null;
    if (!preview) return `<p class="replace-confirm inspector-hint">Pick a replacement in Components to preview it here.</p>`;
    const label = partById(preview.part).label;
    const verdict = preview.result.valid ? describeChange(preview.change) : `Can’t go here: ${preview.result.reason}`;
    return `<div class="replace-confirm" role="group" aria-label="Replace">
        <p>Replace with <strong>${label}</strong>?<br><span class="${preview.result.valid ? 'ok' : 'bad'}">${verdict}</span></p>
        <div class="inspector-actions"><button type="button" class="primary" data-action="replace-confirm" ${preview.result.valid ? '' : 'disabled'}>Replace</button><button type="button" data-action="replace-cancel">Cancel</button></div>
      </div>`;
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
    if (action === 'replace-open' && selected.kind === 'piece') {
      if (replacing) closeReplace();
      else openReplace(selected.index);
    }
    if (action === 'replace-confirm') void confirmReplace();
    if (action === 'replace-cancel') closeReplace();
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
    const target = selected;
    select(null);
    await removeTarget(target);
  }

  // ---- Applying, undo and redo ----
  /** Turn a placed piece a quarter (as the inspector's Rotate does) and keep it selected. */
  function rotateAt(index: number) {
    const result = rotatePiece(host.scene(), index);
    if (result.valid && result.scene)
      void commit(result.scene).then(() => {
        host.sound('rotate');
        select({ kind: 'piece', index: result.scene!.pieces.length - 1 });
      });
    else showError(result.reason ?? 'Can’t rotate it here');
  }

  // ---- Previews of an edit to a placed piece (turning or replacing it): a ghost where it would go, and its connections ----
  type EditPreview = { kind: 'turn' | 'replace'; index: number; part: PartId; result: PlacementResult; change: ReturnType<typeof connectionChange> | null };
  let editPreview: EditPreview | null = null;
  const editPreviewRoot = new Group();
  editPreviewRoot.name = 'editor-edit-preview';
  let editGhost: { part: PartId; model: Object3D; materials: MeshBasicMaterial[] } | null = null;
  let editGhostLoading: PartId | null = null;
  /** Something the map draws (a ghost or outline) changed: draw on the next frame. */
  let dirty = false;

  /** The connections an edit keeps, breaks or makes, worked out even for an invalid one (to show what it would break). */
  function previewChange(scene: SceneDefinition, index: number, result: PlacementResult) {
    const after = result.scene ?? (result.placement ? { ...removePiece(scene, index), pieces: [...removePiece(scene, index).pieces, result.placement] } : null);
    return after ? connectionChange(scene, index, after, after.pieces.length - 1) : null;
  }

  function showEditPreview(preview: EditPreview) {
    editPreview = preview;
    if (editGhost?.part !== preview.part && editGhostLoading !== preview.part) {
      editGhostLoading = preview.part;
      void makeGhost(preview.part).then((ghost) => {
        if (editGhostLoading !== preview.part) return ghost.materials.forEach((m) => m.dispose());
        editGhostLoading = null;
        if (editGhost) {
          editPreviewRoot.remove(editGhost.model);
          editGhost.materials.forEach((m) => m.dispose());
        }
        editGhost = { part: preview.part, ...ghost };
        editPreviewRoot.add(ghost.model);
        placeEditGhost();
      });
    }
    placeEditGhost();
  }

  function placeEditGhost() {
    dirty = true;
    if (!editGhost) return;
    const p = editPreview?.result.placement;
    editGhost.model.visible = !!p && editGhost.part === editPreview!.part;
    if (!p) return;
    editGhost.model.position.set(...boardToWorld([p.at[0], p.level ?? 0, p.at[1]]));
    editGhost.model.rotation.y = (p.rotation * Math.PI) / 180;
    for (const m of editGhost.materials) m.color.set(editPreview!.result.valid ? VALID_COLOUR : INVALID_COLOUR);
  }

  function clearEditPreview() {
    if (!editPreview) return;
    editPreview = null;
    editGhostLoading = null;
    if (editGhost) editGhost.model.visible = false;
    dirty = true;
  }

  /** "2 stay connected · 1 breaks": what an edit does to a piece's connections, in words (colour and shape show it too). */
  function describeChange(change: EditPreview['change']) {
    if (!change) return '';
    const parts = [
      change.kept.length && `${change.kept.length} stay${change.kept.length === 1 ? 's' : ''} connected`,
      change.broken.length && `${change.broken.length} break${change.broken.length === 1 ? 's' : ''}`,
      change.made.length && `${change.made.length} new`,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'No connections';
  }

  // ---- What's drawn over the map: the rotation handle round the selected piece, and connection markers ----
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.classList.add('editor-overlay');
  overlay.innerHTML = `
    <defs><marker id="handle-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 z" /></marker></defs>
    <path class="handle-track" />
    <path class="handle-grip" marker-start="url(#handle-arrow)" marker-end="url(#handle-arrow)" />
    <path class="handle-hit" />
    <g class="connection-markers"></g>`;
  host.viewport.append(overlay);
  const track = overlay.querySelector<SVGPathElement>('.handle-track')!;
  const grip = overlay.querySelector<SVGPathElement>('.handle-grip')!;
  const hit = overlay.querySelector<SVGPathElement>('.handle-hit')!;
  const markerLayer = overlay.querySelector<SVGGElement>('.connection-markers')!;
  // The knob on the handle: drag it (or the grip) to turn the piece, or click it for a quarter turn.
  const pieceRotate = document.createElement('button');
  pieceRotate.type = 'button';
  pieceRotate.className = 'icon-button piece-rotate';
  pieceRotate.setAttribute('aria-label', 'Rotate this piece');
  pieceRotate.title = 'Drag round to turn it · click for a quarter turn (R)';
  pieceRotate.innerHTML = icon('rotate');
  pieceRotate.hidden = true;
  host.viewport.append(pieceRotate);

  /** A board point (x, level, z in tiles) on screen, relative to the viewport. */
  function onScreen([x, level, z]: BoardPoint) {
    const p = new Vector3(...boardToWorld([x, level, z])).project(host.camera);
    const rect = host.canvas.getBoundingClientRect();
    const area = host.viewport.getBoundingClientRect();
    return { x: rect.left - area.left + ((p.x + 1) / 2) * rect.width, y: rect.top - area.top + ((1 - p.y) / 2) * rect.height };
  }

  /** The piece being turned with the handle: where the drag started, and the turn it shows now. */
  let turning: {
    index: number;
    start: QuarterTurn;
    rotation: QuarterTurn;
    from: [number, number];
    screen: { x: number; y: number };
    /** The angle swept so far (radians, anticlockwise), so the grip follows the pointer. */
    swept: number;
    moved: boolean;
    cancelled: boolean;
  } | null = null;

  /** Keep the handle round the selected piece on screen (the camera may move), or hide it. */
  function drawHandle() {
    const index = selected?.kind === 'piece' && !drag && !removeTool && !replacing && host.canEdit() ? selected.index : undefined;
    const piece = index === undefined ? undefined : host.scene().pieces[index];
    if (!piece) {
      for (const path of [track, grip, hit]) path.removeAttribute('d');
      pieceRotate.hidden = true;
      overlay.classList.remove('turning');
      return;
    }
    const { min, max } = PIECES[piece.piece].footprint;
    let radius = Math.max(...min.map(Math.abs), ...max.map(Math.abs)) + HANDLE_GAP;
    const level = piece.level ?? 0;
    // Angles anticlockwise seen from above (x east, z south), as the piece's rotation turns.
    const at = (angle: number) => onScreen([piece.at[0] + radius * Math.cos(angle), level, piece.at[1] - radius * Math.sin(angle)]);
    const samples = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2);
    const centre = onScreen([piece.at[0], level, piece.at[1]]);
    // Zoomed out, grow the ring so its narrowest side is still easy to grab.
    const narrowest = Math.min(...samples.map((a) => at(a)).map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
    if (narrowest < HANDLE_MIN_PX * 0.6) radius *= (HANDLE_MIN_PX * 0.6) / Math.max(narrowest, 1);
    const ring = samples.map(at);
    track.setAttribute('d', `M${ring.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} Z`);
    // The grip faces the viewer (the ring's lowest point on screen) and follows a turn in progress.
    const front = samples[ring.reduce((best, p, i) => (p.y > ring[best].y ? i : best), 0)];
    const middle = front + (turning?.swept ?? 0);
    const arc = Array.from({ length: 17 }, (_, i) => at(middle - GRIP_SPAN / 2 + (i / 16) * GRIP_SPAN));
    const d = `M${arc.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;
    grip.setAttribute('d', d);
    hit.setAttribute('d', d);
    const knob = at(middle);
    pieceRotate.style.left = `${knob.x}px`;
    pieceRotate.style.top = `${knob.y}px`;
    pieceRotate.hidden = false;
    overlay.classList.toggle('turning', !!turning?.moved);
  }

  /** Markers on the road ends an edit would keep (blue dot), break (red ring with a cross) or newly make (blue ring). */
  function drawMarkers() {
    const change = editPreview?.change;
    const key = change ? JSON.stringify(change) : '';
    const points = change
      ? [...change.kept.map((p) => ({ p, kind: 'kept' })), ...change.broken.map((p) => ({ p, kind: 'broken' })), ...change.made.map((p) => ({ p, kind: 'made' }))]
      : [];
    markerLayer.dataset.key = key;
    markerLayer.innerHTML = points
      .map(({ p, kind }) => {
        const { x, y } = onScreen(p);
        const cross = kind === 'broken' ? `<path d="M${x - 4} ${y - 4} L${x + 4} ${y + 4} M${x + 4} ${y - 4} L${x - 4} ${y + 4}" />` : '';
        return `<g class="connection ${kind}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" />${cross}</g>`;
      })
      .join('');
  }

  function beginTurn(event: PointerEvent) {
    if (event.button !== 0 || selected?.kind !== 'piece' || !host.canEdit()) return;
    const from = boardPoint(event.clientX, event.clientY);
    if (!from) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const piece = host.scene().pieces[selected.index];
    turning = { index: selected.index, start: piece.rotation, rotation: piece.rotation, from, screen: { x: event.clientX, y: event.clientY }, swept: 0, moved: false, cancelled: false };
  }
  pieceRotate.addEventListener('pointerdown', beginTurn);
  hit.addEventListener('pointerdown', beginTurn);
  // The knob's own click is handled on release (a click is a quarter turn), not here; keyboard presses still click it.
  pieceRotate.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    if (selected?.kind === 'piece') rotateAt(selected.index);
  });
  window.addEventListener('pointermove', (event) => {
    const t = turning;
    if (!t || t.cancelled) return;
    if (!t.moved && Math.hypot(event.clientX - t.screen.x, event.clientY - t.screen.y) <= DRAG_THRESHOLD) return;
    t.moved = true;
    const to = boardPoint(event.clientX, event.clientY);
    const scene = host.scene();
    const piece = scene.pieces[t.index];
    if (!to || !piece) return;
    const angle = ([x, z]: [number, number]) => Math.atan2(-(z - piece.at[1]), x - piece.at[0]);
    t.swept = Math.atan2(Math.sin(angle(to) - angle(t.from)), Math.cos(angle(to) - angle(t.from)));
    const rotation = turnedRotation(t.start, piece.at, t.from, to);
    // Beside the knob (which rides the ring), not on it.
    const labelAt = { x: parseFloat(pieceRotate.style.left) + 6, y: parseFloat(pieceRotate.style.top) - 4 };
    if (rotation === t.start) {
      t.rotation = rotation;
      clearEditPreview();
      return showLabelAt('Turn further, or let go to leave it', true, labelAt);
    }
    if (rotation !== t.rotation || !editPreview) {
      t.rotation = rotation;
      const result = turnPiece(scene, t.index, rotation);
      showEditPreview({ kind: 'turn', index: t.index, part: piece.piece as PartId, result, change: previewChange(scene, t.index, result) });
    }
    const preview = editPreview!;
    const turn = ((rotation - t.start + 360) % 360) as number;
    const words = turn === 180 ? 'Half turn' : turn === 90 ? 'Quarter turn left' : 'Quarter turn right';
    showLabelAt(preview.result.valid ? `✓ ${words} · ${describeChange(preview.change)}` : `✕ ${preview.result.reason} · ${describeChange(preview.change)}`, preview.result.valid, labelAt);
  });
  window.addEventListener('pointerup', () => {
    const t = turning;
    if (!t) return;
    turning = null;
    const preview = editPreview;
    clearEditPreview();
    reasonLabel.hidden = true;
    if (t.cancelled) return;
    // A press that didn't travel is a click: a quarter turn, as the knob always did.
    if (!t.moved) return rotateAt(t.index);
    // Only a valid turn to somewhere new is kept; otherwise it springs back, quietly.
    if (!preview?.result.valid || !preview.result.scene || t.rotation === t.start) return;
    const scene = preview.result.scene;
    void commit(scene).then(() => {
      host.sound('rotate');
      select({ kind: 'piece', index: scene.pieces.length - 1 });
    });
  });

  // ---- Remove tool: click roads and signs one after another to clear them ----
  let removeTool = false;
  let removeHover: Target | null = null;
  const removeOutline = new Box3Helper(new Box3(), new Color(REMOVE_COLOUR));
  removeOutline.name = 'editor-remove-highlight';
  removeOutline.renderOrder = 3;
  (removeOutline.material as Material).depthTest = false;
  const removeToggle = drawer.querySelector<HTMLButtonElement>('[data-action="remove-tool"]')!;

  function setRemoveTool(on: boolean) {
    if (on === removeTool) return;
    removeTool = on;
    removeToggle.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('removing', on);
    if (on) {
      cancelDrag();
      closeReplace();
      select(null);
    }
    showRemoveHover(null);
  }

  /** Outline in red what a click would remove, and say so beside the pointer. */
  function showRemoveHover(target: Target | null, at?: { x: number; y: number }) {
    const key = (t: Target | null) => (t ? `${t.kind}:${t.index}` : '');
    if (key(target) !== key(removeHover)) {
      removeHover = target;
      removeOutline.parent?.remove(removeOutline);
      const view = host.view();
      const object = target && view && sceneObject(view, target);
      if (object) {
        removeOutline.box.setFromObject(object).expandByScalar(0.15);
        view!.add(removeOutline);
      }
      dirty = true;
    }
    if (!removeTool) return;
    const scene = host.scene();
    const name = target ? (target.kind === 'piece' ? partById(scene.pieces[target.index].piece as PartId)?.label : partById(scene.controls[target.index].type).label) : null;
    if (at) showLabelAt(name ? `Click to remove · ${name}` : 'Remove: click a road or sign · Esc to stop', false, at);
  }

  function sceneObject(view: Scene, target: Target) {
    const group = view.getObjectByName(target.kind === 'piece' ? 'road-pieces' : 'traffic-controls');
    return group?.children.find((o) => o.userData[target.kind === 'piece' ? 'pieceIndex' : 'controlIndex'] === target.index);
  }

  // ---- "Road removed · Undo" ----
  const toast = document.createElement('div');
  toast.className = 'edit-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  host.dock.parentElement?.prepend(toast);
  let toastTimer = 0;
  function showToast(text: string) {
    toast.innerHTML = `<span></span> <span class="toast-dot" aria-hidden="true">·</span> <button type="button" data-action="toast-undo">Undo</button>`;
    toast.querySelector('span')!.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), TOAST_MS);
  }
  toast.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement).closest('[data-action="toast-undo"]')) return;
    toast.hidden = true;
    void undo();
  });

  /** Remove a piece or sign as one undoable edit, with its tap and the toast. */
  async function removeTarget(target: Target) {
    if (!host.canEdit()) return;
    const scene = host.scene();
    const exists = target.kind === 'piece' ? scene.pieces[target.index] : scene.controls[target.index];
    if (!exists) return;
    const name = target.kind === 'piece' ? 'Road' : partById(scene.controls[target.index].type).label;
    const edited = target.kind === 'piece' ? removePiece(scene, target.index) : removeControl(scene, target.index);
    showRemoveHover(null);
    await commit(edited);
    host.sound('remove');
    showToast(`${name} removed`);
  }

  // ---- Replace: the drawer offers what fits here first; a pick is previewed in place until confirmed ----
  let replacing: { index: number } | null = null;
  const replaceSection = drawer.querySelector<HTMLElement>('.parts-replace')!;

  function openReplace(index: number) {
    if (!host.canEdit()) return;
    cancelDrag();
    setRemoveTool(false);
    clearEditPreview();
    replacing = { index };
    const scene = host.scene();
    const name = partById(scene.pieces[index].piece as PartId)?.label ?? scene.pieces[index].piece;
    const options = replacementsFor(scene, index).filter((o) => o.fits);
    replaceSection.innerHTML = `
      <header><h3>Replace ${name}</h3><button type="button" class="replace-close" data-action="replace-cancel" aria-label="Stop replacing">×</button></header>
      <p class="parts-hint">Fits here, best first. Pick one to preview it in place.</p>
      <div class="parts-group replace-options" role="group" aria-label="Fits here">${options
        .map(
          (o) =>
            `<button type="button" class="part" data-replace="${o.part}"><span class="part-picture" aria-hidden="true"></span><span class="part-label">${partById(o.part).label}</span><span class="part-note">${o.broken ? `${o.broken} break${o.broken === 1 ? 's' : ''}` : o.kept ? 'Keeps all' : 'Nothing attached'}</span></button>`,
        )
        .join('')}</div>`;
    // The same pictures as the drawer's own tiles (once they're drawn).
    for (const tile of replaceSection.querySelectorAll<HTMLElement>('[data-replace]')) {
      const picture = drawer.querySelector<HTMLElement>(`.parts-groups [data-part="${tile.dataset.replace}"] .part-picture`)?.style.backgroundImage;
      if (picture) tile.querySelector<HTMLElement>('.part-picture')!.style.backgroundImage = picture;
    }
    replaceSection.hidden = false;
    drawer.classList.add('replacing');
    if (drawer.hidden) {
      drawer.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      placeTray();
      showPictures();
      host.trayToggled();
    }
    drawer.querySelector('.parts-groups')?.scrollTo({ top: 0 });
    replaceSection.querySelector<HTMLElement>('[data-replace]')?.focus();
    renderInspector();
  }

  function previewReplacement(part: PartId) {
    if (!replacing) return;
    const scene = host.scene();
    const result = replacePiece(scene, replacing.index, part);
    showEditPreview({ kind: 'replace', index: replacing.index, part, result, change: previewChange(scene, replacing.index, result) });
    for (const tile of replaceSection.querySelectorAll<HTMLElement>('[data-replace]')) tile.setAttribute('aria-pressed', String(tile.dataset.replace === part));
    renderInspector();
  }

  function closeReplace() {
    if (!replacing) return;
    replacing = null;
    replaceSection.hidden = true;
    replaceSection.innerHTML = '';
    drawer.classList.remove('replacing');
    clearEditPreview();
    renderInspector();
  }

  async function confirmReplace() {
    const preview = editPreview;
    if (preview?.kind !== 'replace' || !preview.result.valid || !preview.result.scene) return;
    const scene = preview.result.scene;
    closeReplace();
    await commit(scene);
    host.sound('place');
    select({ kind: 'piece', index: scene.pieces.length - 1 });
  }

  replaceSection.addEventListener('click', (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-replace]');
    if (tile) previewReplacement(tile.dataset.replace as PartId);
  });

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
      drawHandle();
      drawMarkers();
      // Edit previews live on the current view (a new one is built after every edit).
      if (editPreview && editPreviewRoot.parent !== host.view()) {
        editPreviewRoot.parent?.remove(editPreviewRoot);
        host.view()?.add(editPreviewRoot);
        dirty = true;
      }
      const placing = drag !== null;
      const changed = showOutline() || placing || wasPlacing || dirty;
      dirty = false;
      wasPlacing = placing; // one more frame after placing ends, to clear the preview
      // A new view after an edit (placing armed parts one after another): the preview moves onto it.
      if (drag?.ghost && ghostRoot.parent !== host.view()) {
        ghostRoot.parent?.remove(ghostRoot);
        host.view()?.add(ghostRoot);
      }
      const locked = !host.canEdit();
      if (locked === lockedShown) return changed;
      lockedShown = locked;
      for (const button of drawer.querySelectorAll<HTMLButtonElement>('.part')) button.disabled = locked;
      drawer.classList.toggle('locked', locked);
      toggle.title = locked ? 'Pause to edit the map' : 'Customise the map';
      if (locked) {
        cancelDrag();
        setRemoveTool(false);
        closeReplace();
        if (turning) turning.cancelled = true;
        select(null);
      }
      syncButtons();
      return true;
    },
  };
}
