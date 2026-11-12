import { AmbientLight, Box3, DirectionalLight, type Object3D, PerspectiveCamera, Scene, Sphere, Vector3, WebGLRenderer } from 'three';

/** Thumbnail edge, CSS pixels; drawn at twice that for sharp screens. */
export const THUMBNAIL_SIZE = 64;
const PIXEL_RATIO = 2;
const FIELD_OF_VIEW = 30;
/** The same view direction as the map's starting camera: along the cube diagonal. */
const VIEW_DIRECTION = new Vector3(1, 1, 1).normalize();

/**
 * Picture each model the way the map shows it, for the parts tray. Uses one short-lived
 * WebGL context: everything is drawn, read back as PNG data URLs, and the context freed.
 */
export async function renderThumbnails<K extends string>(models: Map<K, Promise<Object3D>>): Promise<Map<K, string>> {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 100);

  const pictures = new Map<K, string>();
  try {
    for (const [key, loading] of models) {
      const model = (await loading).clone();
      scene.add(model);
      frame(camera, model);
      renderer.render(scene, camera);
      pictures.set(key, canvas.toDataURL('image/png'));
      scene.remove(model);
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return pictures;
}

/** Point the camera along the view diagonal at the model, far enough back that it fills the frame. */
function frame(camera: PerspectiveCamera, model: Object3D) {
  const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
  const distance = sphere.radius / Math.sin(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
}
