import type { Random } from './random';

export type ProfileId = 'steady' | 'cautious' | 'assertive' | 'cooperative' | 'impatient';

type Range = [number, number];

/**
 * Overlapping preference ranges for each driver profile (`BEHAVIOUR_PLAN.md`).
 * `speedFactor` scales the speed limit; `acceleration` is the share of the vehicle's
 * own maximum the driver likes to use; `comfortBraking` is in m/s²; `headway` and
 * `acceptedGap` are seconds; `minGap` is metres.
 */
const PROFILES: Record<ProfileId, { label: string; speedFactor: Range; headway: Range; minGap: Range; acceleration: Range; comfortBraking: Range; acceptedGap: Range }> = {
  steady: { label: 'Steady', speedFactor: [0.95, 1.05], headway: [1.3, 1.7], minGap: [2.0, 2.6], acceleration: [0.72, 0.88], comfortBraking: [2.0, 2.8], acceptedGap: [4.0, 5.5] },
  cautious: { label: 'Cautious', speedFactor: [0.85, 0.98], headway: [1.7, 2.3], minGap: [2.5, 3.5], acceleration: [0.55, 0.75], comfortBraking: [1.6, 2.3], acceptedGap: [5.0, 7.0] },
  assertive: { label: 'Assertive', speedFactor: [1.0, 1.12], headway: [0.9, 1.35], minGap: [1.5, 2.2], acceleration: [0.88, 1.0], comfortBraking: [2.6, 3.5], acceptedGap: [3.0, 4.2] },
  cooperative: { label: 'Cooperative', speedFactor: [0.93, 1.03], headway: [1.4, 1.9], minGap: [2.0, 2.8], acceleration: [0.68, 0.85], comfortBraking: [2.0, 2.6], acceptedGap: [4.0, 5.5] },
  impatient: { label: 'Impatient', speedFactor: [1.0, 1.1], headway: [1.0, 1.5], minGap: [1.8, 2.4], acceleration: [0.82, 1.0], comfortBraking: [2.4, 3.2], acceptedGap: [3.2, 4.5] },
};

export interface Driver {
  profile: ProfileId;
  label: string;
  speedFactor: number;
  headway: number;
  minGap: number;
  acceleration: number;
  comfortBraking: number;
  acceptedGap: number;
}

/** Draw one driver's preferences, fixed for the whole trip. */
export function sampleDriver(profile: ProfileId, random: Random): Driver {
  const p = PROFILES[profile];
  const pick = ([min, max]: Range) => random.between(min, max);
  return {
    profile,
    label: p.label,
    speedFactor: pick(p.speedFactor),
    headway: pick(p.headway),
    minGap: pick(p.minGap),
    acceleration: pick(p.acceleration),
    comfortBraking: pick(p.comfortBraking),
    acceptedGap: pick(p.acceptedGap),
  };
}
