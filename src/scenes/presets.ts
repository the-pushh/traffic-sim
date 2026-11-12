import type { SceneDefinition } from '../simulation/network/scene';
import { mainStreet } from './mainStreet';
import { marketRoundabout } from './marketRoundabout';

/** The preset scenes, Main Street first (the app opens on it); the scene carousel (T11) will cycle through them in this order. */
export const PRESETS: readonly SceneDefinition[] = [mainStreet, marketRoundabout];
