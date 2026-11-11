import type { ControlPlacement } from '../../simulation/network/scene';

/** City Kit models for traffic controls placed beside an approach. No yield sign exists; the warning sign stands in. */
export const CONTROL_MODELS: Record<ControlPlacement['type'], string> = {
  signal: 'traffic-light',
  stop: 'road-sign-stop',
  yield: 'road-sign-warning',
};
