import {
  Box3,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  Shape,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import { groundBoard, starterScene } from '../../scenes/starterScene';
import { createAssetLoader } from '../loaders/assetLoader';

export interface StarterSceneView {
  scene: Scene;
  /** World-space bounds of the road network and vehicle, for camera framing. */
  bounds: Box3;
}

const GROUND_TOP_COLOR = new Color('#7fa86a');
const GROUND_SIDE_COLOR = new Color('#6b5a45');
/** Top surface of a City Kit Roads tile, in source units (observed in the GLB bounds). */
const ROAD_SURFACE_HEIGHT = 0.02;

export async function createStarterScene(renderer: WebGLRenderer, baseUrl: string): Promise<StarterSceneView> {
  const { road, vehicle } = starterScene;
  // No scene background: the canvas is transparent so the CSS background token shows through.
  const scene = new Scene();

  const load = createAssetLoader(baseUrl);
  const [roadPiece, car, surfaceTexture] = await Promise.all([
    load.model(road.pieceUrl),
    load.model(vehicle.url),
    load.texture(road.surfaceTextureUrl),
  ]);

  addLights(scene);

  const roadLength = road.tileSize * road.tileCount;
  const ground = createGroundBoard();
  scene.add(ground);

  // Road built from supplied road-straight pieces laid end to end along Z.
  const pieceRoad = new Group();
  pieceRoad.name = 'road-pieces';
  for (let i = 0; i < road.tileCount; i++) {
    const tile = roadPiece.clone();
    tile.scale.setScalar(road.tileSize);
    // The source piece runs along X; turn it to run along Z with the traffic.
    tile.rotation.y = Math.PI / 2;
    tile.position.z = (i - (road.tileCount - 1) / 2) * road.tileSize;
    pieceRoad.add(tile);
  }
  receiveShadows(pieceRoad);
  scene.add(pieceRoad);

  // Parallel road surface using the supplied flat road texture, repeated once per tile.
  surfaceTexture.colorSpace = SRGBColorSpace;
  surfaceTexture.wrapS = surfaceTexture.wrapT = RepeatWrapping;
  surfaceTexture.repeat.set(1, road.tileCount);
  surfaceTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const surface = new Mesh(
    new PlaneGeometry(road.tileSize, roadLength),
    new MeshStandardMaterial({ map: surfaceTexture }),
  );
  surface.name = 'road-surface-texture';
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(road.surfaceOffsetX, 0.005, 0);
  surface.receiveShadow = true;
  scene.add(surface);

  car.name = 'vehicle';
  car.scale.setScalar(vehicle.scale);
  car.position.set(vehicle.laneOffsetX, ROAD_SURFACE_HEIGHT * road.tileSize, vehicle.positionZ);
  car.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = true;
  });
  scene.add(car);

  // Frame the whole board, which contains the roads and vehicle.
  const bounds = new Box3().setFromObject(ground).union(new Box3().setFromObject(car));
  return { scene, bounds };
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

function receiveShadows(root: Object3D) {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) o.receiveShadow = true;
  });
}
