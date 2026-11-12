import type { SceneDefinition } from '../simulation/network/scene';
import { mainStreet } from './mainStreet';
import { marketRoundabout } from './marketRoundabout';

/** The preset scenes in the order the scene pill cycles through them. */
export const PRESETS: readonly SceneDefinition[] = [mainStreet, marketRoundabout];
