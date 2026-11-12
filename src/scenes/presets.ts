import type { SceneDefinition } from '../simulation/network/scene';
import { blankBoard } from './blankBoard';
import { flyoverBottleneck } from './flyoverBottleneck';
import { mainStreet } from './mainStreet';
import { marketRoundabout } from './marketRoundabout';
import { schoolRun } from './schoolRun';

/** The scenes the pill cycles through, in order: Main Street first (the app opens on it), the blank board last. */
export const PRESETS: readonly SceneDefinition[] = [mainStreet, marketRoundabout, schoolRun, flyoverBottleneck, blankBoard];
