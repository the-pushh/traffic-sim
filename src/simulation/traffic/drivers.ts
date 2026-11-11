import type { Random } from './random';

export type ProfileId = 'steady' | 'cautious' | 'assertive' | 'cooperative' | 'impatient';

type Range = [number, number];

/**
 * Overlapping preference ranges for each driver profile (`BEHAVIOUR_PLAN.md`).
 * `speedFactor` scales the speed limit; `acceleration` is the share of the vehicle's
 * own maximum the driver likes to use; `comfortBraking` is in m/s²; `headway` and
 * `acceptedGap` are seconds; `minGap` is metres.
 */
export const PROFILE_RANGES: Record<ProfileId, { label: string; speedFactor: Range; headway: Range; minGap: Range; acceleration: Range; comfortBraking: Range; acceptedGap: Range }> = {
  // Ranges overlap across all profiles, so a brisk cautious driver can behave like a mild assertive one.
  steady: { label: 'Steady', speedFactor: [0.94, 1.06], headway: [1.25, 1.8], minGap: [1.9, 2.8], acceleration: [0.7, 0.9], comfortBraking: [1.9, 2.9], acceptedGap: [3.9, 5.6] },
  cautious: { label: 'Cautious', speedFactor: [0.85, 1.0], headway: [1.6, 2.3], minGap: [2.4, 3.5], acceleration: [0.55, 0.78], comfortBraking: [1.6, 2.4], acceptedGap: [4.8, 7.0] },
  assertive: { label: 'Assertive', speedFactor: [0.98, 1.12], headway: [0.9, 1.65], minGap: [1.5, 2.5], acceleration: [0.76, 1.0], comfortBraking: [2.3, 3.5], acceptedGap: [3.0, 5.0] },
  cooperative: { label: 'Cooperative', speedFactor: [0.92, 1.04], headway: [1.4, 2.0], minGap: [2.0, 2.9], acceleration: [0.66, 0.86], comfortBraking: [1.9, 2.6], acceptedGap: [3.9, 5.6] },
  impatient: { label: 'Impatient', speedFactor: [0.99, 1.1], headway: [1.0, 1.7], minGap: [1.7, 2.5], acceleration: [0.74, 1.0], comfortBraking: [2.2, 3.2], acceptedGap: [3.2, 5.0] },
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
  const p = PROFILE_RANGES[profile];
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
