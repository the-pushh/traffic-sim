import { sceneryFor } from '../../scenes/scenery';
import { createSceneryLayer } from './sceneryLayer';
import {
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Scene,
  Shape,
  Sprite,
  Vector3,
} from 'three';
import { badgeMaterial, textSprite } from './badges';
import { boardToWorld, groundBoard, TILE_SIZE } from '../../scenes/board';
import { buildLaneGraph, type LaneGraph, type Point3, portPose } from '../../simulation/network/buildLaneGraph';
import { rightOf } from '../../simulation/network/geometry';
import { PIECES } from '../../simulation/network/pieces';
import { type SceneDefinition, type SignalTiming, validateScene } from '../../simulation/network/scene';
import { aspectAt, DEFAULT_SIGNAL_TIMING } from '../../simulation/traffic/signals';
import { createAssetLoader } from '../loaders/assetLoader';
import { CONTROL_MODELS } from './controlModels';
import { MISMATCH_COLOUR, SIGNAL_LAMP_COLOURS, SIGNAL_LAMP_HEIGHTS } from './palette';

/** A scene definition that can't be loaded, with each problem in plain language. */
export class SceneDefinitionError extends Error {
  constructor(
    readonly sceneName: string,
    readonly problems: string[],
  ) {
    super(`Couldn't open ${sceneName}: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`);
  }
}

export interface SceneView {
  scene: Scene;
  graph: LaneGraph;
  /** Show every traffic light's aspect at simulation time `t`. */
  updateSignals(t: number): void;
  /** Show how many trips each entry has turned away for want of a way through (hidden at zero). */
  updateBlocked(byEntry: Readonly<Record<string, number>>): void;
  /** World-space bounds of the board, for camera framing. */
  bounds: Box3;
  /** Free the GPU resources this view created (not the shared models or badges); call when leaving the scene. */
  dispose(): void;
}

const GROUND_TOP_COLOR = new Color('#7fa86a');
const GROUND_SIDE_COLOR = new Color('#6b5a45');
/** Road surface height above a piece's base, in tiles (measured from the GLBs). */
const ROAD_SURFACE = 0.02;
/** 3D-scene marker colours (kept separate from the interface palette). */
const LANE_COLOR = '#dfe9ff';
const GATEWAY_COLOR = '#2f6fd6';
const ACCESS_COLOR = '#e07a5f';
const BLOCKED_COLOR = '#c62f2f';

const world = (p: Point3, lift = 0) => {
  const [x, y, z] = boardToWorld([p[0], p[1] + ROAD_SURFACE, p[2]]);
  return new Vector3(x, y + lift, z);
};

/** Build the 3D view of a scene from its definition: board, pieces, controls, and lane overlay. */
export async function createSceneView(definition: SceneDefinition, baseUrl: string): Promise<SceneView> {
  const problems = validateScene(definition);
  if (problems.length) throw new SceneDefinitionError(definition.name, problems);
  const graph = buildLaneGraph(definition.pieces);
  const load = createAssetLoader(baseUrl);
  const modelNames = new Set([
    ...definition.pieces.map((p) => PIECES[p.piece].model),
    ...definition.controls.map((c) => CONTROL_MODELS[c.type]),
  ]);
  const scenery = sceneryFor(definition);
  const natureNames = [...new Set(scenery.map((s) => s.model))];
  const [models, natureModels] = await Promise.all([
    Promise.all([...modelNames].map((name) => load.model(`models/roads/${name}.glb`))),
    Promise.all(natureNames.map((name) => load.model(`models/nature/${name}.glb`))),
  ]);
  const byName = new Map([...modelNames].map((name, i) => [name, models[i]]));

  // No scene background: the canvas is transparent so the CSS background token shows through.
  const scene = new Scene();
  addLights(scene);
  const board = createGroundBoard();
  scene.add(board);

  const pieces = new Group();
  pieces.name = 'road-pieces';
  definition.pieces.forEach((placement, index) => {
    const piece = byName.get(PIECES[placement.piece].model)!.clone();
    // So a click on the board can be traced back to the scene's piece (the editor).
    piece.userData.pieceIndex = index;
    piece.scale.setScalar(TILE_SIZE);
    piece.rotation.y = (placement.rotation * Math.PI) / 180;
    piece.position.copy(new Vector3(...boardToWorld([placement.at[0], placement.level ?? 0, placement.at[1]])));
    pieces.add(piece);
  });
  setShadows(pieces, { receive: true });
  scene.add(pieces);
  // Trees, bushes and rocks on the tiles no road covers (decoration only).
  scene.add(createSceneryLayer(scenery, new Map(natureNames.map((name, i) => [name, natureModels[i]]))));

  const controls = new Group();
  controls.name = 'traffic-controls';
  const signalLamps: { timing: SignalTiming; lamp: Mesh; base: Vector3; material: MeshBasicMaterial }[] = [];
  const lampGeometry = new SphereGeometry(0.22, 16, 12);
  definition.controls.forEach((control, index) => {
    const sign = byName.get(CONTROL_MODELS[control.type])!.clone();
    sign.scale.setScalar(TILE_SIZE);
    const pose = signPose(definition.pieces, control);
    sign.position.copy(pose.position);
    sign.rotation.y = pose.rotationY;
    sign.userData.controlIndex = index;
    controls.add(sign);
    if (control.type === 'signal') {
      // A lamp on the light shows its aspect by colour and by position (red top, amber middle, green bottom).
      const material = new MeshBasicMaterial({ color: SIGNAL_LAMP_COLOURS.red });
      const lamp = new Mesh(lampGeometry, material);
      controls.add(lamp);
      signalLamps.push({ timing: control.timing ?? DEFAULT_SIGNAL_TIMING, lamp, base: sign.position.clone(), material });
    }
  });
  setShadows(controls, { cast: true });
  scene.add(controls);

  scene.add(createLaneOverlay(graph));

  // Blocked-trip counts, shown above each entry's label.
  const blockedBadges = new Map<string, Sprite>();
  for (const gateway of graph.gateways) {
    if (!gateway.entryLanes.length) continue;
    const badge = textSprite('0', BLOCKED_COLOR);
    badge.position.copy(world([gateway.at[0], 0, gateway.at[1]], 3.2));
    badge.visible = false;
    badge.name = `blocked-${gateway.label}`;
    scene.add(badge);
    blockedBadges.set(gateway.label, badge);
  }
  const updateBlocked = (byEntry: Readonly<Record<string, number>>) => {
    for (const [label, badge] of blockedBadges) {
      const count = byEntry[label] ?? 0;
      badge.visible = count > 0;
      if (count > 0) badge.material = badgeMaterial(count > 99 ? '99+' : String(count), BLOCKED_COLOR);
    }
  };

  const updateSignals = (t: number) => {
    for (const { timing, lamp, base, material } of signalLamps) {
      const aspect = aspectAt(timing, t);
      material.color.set(SIGNAL_LAMP_COLOURS[aspect]);
      lamp.position.copy(base).add(new Vector3(0, SIGNAL_LAMP_HEIGHTS[aspect], 0));
    }
  };
  updateSignals(0);
  // Geometry and materials the loaded models own: clones share them with the cache, so they stay.
  const shared = new Set<object>();
  for (const model of models)
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry) shared.add(mesh.geometry);
      for (const material of [mesh.material].flat()) if (material) shared.add(material);
    });
  const dispose = () => {
    scene.traverse((object) => {
      if (object instanceof Sprite) return; // badge materials are shared across scenes
      const mesh = object as Mesh;
      if (mesh.geometry && !shared.has(mesh.geometry)) mesh.geometry.dispose();
      if ((object as InstancedMesh).isInstancedMesh) (object as InstancedMesh).dispose(); // the per-instance buffers
      for (const material of [mesh.material].flat()) if (material && !shared.has(material)) material.dispose();
    });
  };
  return { scene, graph, updateSignals, updateBlocked, bounds: new Box3().setFromObject(board), dispose };
}

/** Where a control's sign stands: beside the approach, on the arriving traffic's right, facing that traffic (world units). */
export function signPose(pieces: SceneDefinition['pieces'], control: { piece: number; port: string }) {
  const { centre, facing } = portPose(pieces[control.piece], control.port);
  const right = rightOf([-facing[0], -facing[1]]);
  return {
    position: world([centre[0] + right[0] * 0.55 - facing[0] * 0.05, centre[1] - ROAD_SURFACE, centre[2] + right[1] * 0.55 - facing[1] * 0.05]),
    rotationY: Math.atan2(facing[0], facing[1]),
  };
}

/** Lane centrelines with direction arrows, labelled gateways, open road ends, and driveways. */
function createLaneOverlay(graph: LaneGraph) {
  const overlay = new Group();
  overlay.name = 'lane-overlay';
  const lift = 0.06;

  const positions: number[] = [];
  for (const lane of graph.lanes)
    for (let i = 1; i < lane.points.length; i++) positions.push(...world(lane.points[i - 1], lift).toArray(), ...world(lane.points[i], lift).toArray());
  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(positions, 3));
  overlay.add(new LineSegments(lines, new LineBasicMaterial({ color: LANE_COLOR, transparent: true, opacity: 0.7 })));

  const arrow = new ConeGeometry(0.16, 0.45, 3);
  arrow.rotateX(Math.PI / 2); // point along +z
  const arrows = new InstancedMesh(arrow, new MeshBasicMaterial({ color: LANE_COLOR }), graph.lanes.length);
  const alongZ = new Vector3(0, 0, 1);
  graph.lanes.forEach((lane, i) => {
    const mid = Math.floor(lane.points.length / 2);
    const [a, b] = lane.points.length > 2 ? [lane.points[mid - 1], lane.points[mid]] : [lane.points[0], lane.points[1]];
    const at = lane.points.length > 2 ? world(b, lift) : world(a, lift).lerp(world(b, lift), 0.5);
    const direction = world(b).sub(world(a)).normalize();
    arrows.setMatrixAt(i, new Matrix4().compose(at, new Quaternion().setFromUnitVectors(alongZ, direction), new Vector3(1, 1, 1)));
  });
  overlay.add(arrows);

  for (const gateway of graph.gateways) {
    const label = textSprite(gateway.label, GATEWAY_COLOR);
    label.position.copy(world([gateway.at[0], 0, gateway.at[1]], 1.4));
    overlay.add(label);
  }
  // Open road ends aren't marked (the owner removed the "+" markers): a part placed there snaps to the end anyway.
  // Driveways: where local trips start and end. Labelled with a house, not colour alone.
  const pad = new RingGeometry(0, 0.45, 4);
  const padMaterial = new MeshBasicMaterial({ color: ACCESS_COLOR });
  for (const access of graph.accessPoints) {
    const marker = new Mesh(pad, padMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(world([access.at[0], 0, access.at[1]], lift));
    overlay.add(marker);
    const house = textSprite('⌂', ACCESS_COLOR);
    house.position.copy(marker.position).add(new Vector3(0, 1.2, 0));
    overlay.add(house);
  }
  // Road ends that meet but can't connect.
  for (const mismatch of graph.mismatches) {
    const warning = textSprite('!', MISMATCH_COLOUR);
    warning.position.copy(world([mismatch.at[0], mismatch.level, mismatch.at[1]], 1.4));
    overlay.add(warning);
  }
  return overlay;
}

/** Square board with rounded corners and visible thickness; its top face is at y = 0. */
function createGroundBoard() {
  const { size, cornerRadius, thickness, bevel } = groundBoard;
  const half = size / 2;
  const r = cornerRadius;

  const outline = new Shape();
  outline.moveTo(-half + r, -half);
  outline.lineTo(half - r, -half);
  outline.quadraticCurveTo(half, -half, half, -half + r);
  outline.lineTo(half, half - r);
  outline.quadraticCurveTo(half, half, half - r, half);
  outline.lineTo(-half + r, half);
  outline.quadraticCurveTo(-half, half, -half, half - r);
  outline.lineTo(-half, -half + r);
  outline.quadraticCurveTo(-half, -half, -half + r, -half);

  const geometry = new ExtrudeGeometry(outline, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // ExtrudeGeometry groups: 0 = top/bottom faces, 1 = sides and bevels.
  const board = new Mesh(geometry, [
    new MeshStandardMaterial({ color: GROUND_TOP_COLOR }),
    new MeshStandardMaterial({ color: GROUND_SIDE_COLOR }),
  ]);
  board.name = 'ground-board';
  // Lay the extrusion flat: its depth runs up the Y axis, top face at y = 0.
  board.rotation.x = -Math.PI / 2;
  board.position.set(0, -(thickness + bevel), 0);
  board.receiveShadow = true;
  return board;
}

function addLights(scene: Scene) {
  scene.add(new HemisphereLight('#ffffff', '#5b6b4f', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.8);
  sun.position.set(12, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const shadowCamera = sun.shadow.camera;
  // Cover the whole ground board.
  const reach = groundBoard.size / 2 + 2;
  shadowCamera.left = shadowCamera.bottom = -reach;
  shadowCamera.right = shadowCamera.top = reach;
  shadowCamera.near = 1;
  shadowCamera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}

function setShadows(root: Object3D, { cast = false, receive = false }: { cast?: boolean; receive?: boolean }) {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
