import { Box3, DirectionalLight, HemisphereLight, type Object3D, PerspectiveCamera, Scene, Sphere, Vector3, WebGLRenderer } from 'three';

/** Picture edge in CSS pixels (as the tray shows it), drawn at twice that for sharp screens. */
const SIZE = 56;
const PIXEL_RATIO = 2;
const FIELD_OF_VIEW = 30;
/** Looking down the cube diagonal, like the map's starting view (see `ObserverCamera`). */
const VIEW_DIRECTION = new Vector3(1, 1, 1).normalize();

/**
 * Picture each part's model for the parts tray, lit as the map lights it. One short-lived
 * WebGL context draws them all and is freed. Each picture is handed over as soon as it's
 * drawn; a model that won't load is skipped (its tile keeps just its name).
 */
export async function renderThumbnails<Id>(ids: readonly Id[], load: (id: Id) => Promise<Object3D>, onPicture: (id: Id, dataUrl: string) => void): Promise<void> {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);

  // The scene's own lights (createSceneView): sky and ground fill plus the sun.
  const scene = new Scene();
  scene.add(new HemisphereLight('#ffffff', '#5b6b4f', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.8);
  sun.position.set(12, 30, 10);
  scene.add(sun);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 100);

  try {
    for (const id of ids) {
      let model: Object3D;
      try {
        // A copy: the loaded model is shared with the editor's previews.
        model = (await load(id)).clone();
      } catch {
        continue;
      }
      scene.add(model);
      aimAt(camera, model);
      renderer.render(scene, camera);
      onPicture(id, canvas.toDataURL('image/png'));
      scene.remove(model);
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Point the camera down the view diagonal at the model, far enough back that it fills the frame. */
function aimAt(camera: PerspectiveCamera, model: Object3D) {
  const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
  const distance = sphere.radius / Math.sin(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
}
