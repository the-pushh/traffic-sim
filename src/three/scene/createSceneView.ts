import {
  Box3,
  BufferGeometry,
  CanvasTexture,
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
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { boardToWorld, groundBoard, TILE_SIZE } from '../../scenes/board';
import { buildLaneGraph, type LaneGraph, type Point3, portPose } from '../../simulation/network/buildLaneGraph';
import { rightOf } from '../../simulation/network/geometry';
import { PIECES } from '../../simulation/network/pieces';
import { type SceneDefinition, type SignalTiming, validateScene } from '../../simulation/network/scene';
import { DEFAULT_SIGNAL_TIMING } from '../../simulation/traffic/signals';
import { createAssetLoader } from '../loaders/assetLoader';
import { CONTROL_MODELS } from './controlModels';

/** A scene definition that can't be loaded, with each problem in plain language. */
export class SceneDefinitionError extends Error {
  constructor(
    readonly sceneName: string,
    readonly problems: string[],
  ) {
    super(`Couldn't open ${sceneName}: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`);
  }
}

/** The lamp above one traffic light and the cycle it follows. */
export interface SignalLamp {
  timing: SignalTiming;
  material: MeshBasicMaterial;
}

export interface SceneView {
  scene: Scene;
  graph: LaneGraph;
  signalLamps: SignalLamp[];
  /** World-space bounds of the board, for camera framing. */
  bounds: Box3;
}

const GROUND_TOP_COLOR = new Color('#7fa86a');
const GROUND_SIDE_COLOR = new Color('#6b5a45');
/** Road surface height above a piece's base, in tiles (measured from the GLBs). */
const ROAD_SURFACE = 0.02;
/** 3D-scene marker colours (kept separate from the interface palette). */
const LANE_COLOR = '#dfe9ff';
const GATEWAY_COLOR = '#2f6fd6';
const OPEN_END_COLOR = '#f2c14e';
const ACCESS_COLOR = '#e07a5f';
const MISMATCH_COLOR = '#d64545';

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
  const models = await Promise.all([...modelNames].map((name) => load.model(`models/roads/${name}.glb`)));
  const byName = new Map([...modelNames].map((name, i) => [name, models[i]]));

  // No scene background: the canvas is transparent so the CSS background token shows through.
  const scene = new Scene();
  addLights(scene);
  const board = createGroundBoard();
  scene.add(board);

  const pieces = new Group();
  pieces.name = 'road-pieces';
  for (const placement of definition.pieces) {
    const piece = byName.get(PIECES[placement.piece].model)!.clone();
    piece.scale.setScalar(TILE_SIZE);
    piece.rotation.y = (placement.rotation * Math.PI) / 180;
    piece.position.copy(new Vector3(...boardToWorld([placement.at[0], placement.level ?? 0, placement.at[1]])));
    pieces.add(piece);
  }
  setShadows(pieces, { receive: true });
  scene.add(pieces);

  const controls = new Group();
  controls.name = 'traffic-controls';
  const signalLamps: SignalLamp[] = [];
  const lampGeometry = new SphereGeometry(0.22, 16, 12);
  for (const control of definition.controls) {
    const { centre, facing } = portPose(definition.pieces[control.piece], control.port);
    // Beside the approach, on the arriving traffic's right, facing that traffic.
    const right = rightOf([-facing[0], -facing[1]]);
    const sign = byName.get(CONTROL_MODELS[control.type])!.clone();
    sign.scale.setScalar(TILE_SIZE);
    sign.position.copy(world([centre[0] + right[0] * 0.55 - facing[0] * 0.05, centre[1] - ROAD_SURFACE, centre[2] + right[1] * 0.55 - facing[1] * 0.05]));
    sign.rotation.y = Math.atan2(facing[0], facing[1]);
    controls.add(sign);
    if (control.type === 'signal') {
      // A lamp above the light shows its current aspect (red, amber, green).
      const material = new MeshBasicMaterial({ color: '#d64545' });
      const lamp = new Mesh(lampGeometry, material);
      lamp.position.copy(sign.position).add(new Vector3(0, 2.25, 0));
      controls.add(lamp);
      signalLamps.push({ timing: control.timing ?? DEFAULT_SIGNAL_TIMING, material });
    }
  }
  setShadows(controls, { cast: true });
  scene.add(controls);

  scene.add(createLaneOverlay(graph));

  return { scene, graph, signalLamps, bounds: new Box3().setFromObject(board) };
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
  const ring = new RingGeometry(0.9, 1.15, 32);
  const openEndMaterial = new MeshBasicMaterial({ color: OPEN_END_COLOR });
  for (const end of graph.openEnds) {
    const marker = new Mesh(ring, openEndMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(world([end.at[0] + end.facing[0] * 0.35, end.level, end.at[1] + end.facing[1] * 0.35], lift));
    overlay.add(marker);
    const plus = textSprite('+', OPEN_END_COLOR);
    plus.position.copy(marker.position).add(new Vector3(0, 1.2, 0));
    overlay.add(plus);
  }
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
    const warning = textSprite('!', MISMATCH_COLOR);
    warning.position.copy(world([mismatch.at[0], mismatch.level, mismatch.at[1]], 1.4));
    overlay.add(warning);
  }
  return overlay;
}

const badgeMaterials = new Map<string, SpriteMaterial>();

/** A round badge with a character, always facing the camera. Badges with the same text and colour share one texture. */
function textSprite(text: string, color: string) {
  const key = `${text}|${color}`;
  let material = badgeMaterials.get(key);
  if (!material) {
    material = new SpriteMaterial({ map: badgeTexture(text, color), depthTest: false });
    badgeMaterials.set(key, material);
  }
  const sprite = new Sprite(material);
  sprite.scale.setScalar(1.8);
  sprite.renderOrder = 1;
  return sprite;
}

function badgeTexture(text: string, color: string) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.55}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
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
