import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import { starterScene } from '../../scenes/starterScene';
import { createAssetLoader } from '../loaders/assetLoader';

export interface StarterSceneView {
  scene: Scene;
  /** World-space bounds of the road network and vehicle, for camera framing. */
  bounds: Box3;
}

const GROUND_COLOR = new Color('#7fa86a');
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
  const ground = new Mesh(
    new PlaneGeometry(roadLength * 12, roadLength * 12),
    new MeshStandardMaterial({ color: GROUND_COLOR }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
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

  const bounds = new Box3().setFromObject(pieceRoad).union(new Box3().setFromObject(surface)).union(new Box3().setFromObject(car));
  return { scene, bounds };
}

function addLights(scene: Scene) {
  scene.add(new HemisphereLight('#ffffff', '#5b6b4f', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.8);
  sun.position.set(12, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -20;
  shadowCamera.right = shadowCamera.top = 20;
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
