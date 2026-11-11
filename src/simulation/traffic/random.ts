/** Small seeded random-number generator (mulberry32): the same seed gives the same sequence. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  between(min: number, max: number) {
    return min + (max - min) * this.next();
  }

  /** Exponentially distributed waiting time for events at `ratePerSecond`. */
  exponential(ratePerSecond: number) {
    return -Math.log(1 - this.next()) / ratePerSecond;
  }

  /** Pick a key with probability proportional to its weight. */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let r = this.next() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) if ((r -= w) < 0) return key;
    return entries[entries.length - 1][0];
  }

  /** An independent generator derived from this one and a label. */
  fork(label: number) {
    return new Random(Math.imul(this.state ^ 0x9e3779b9, 2654435761 + label * 97) >>> 0);
  }
}
