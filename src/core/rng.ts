/**
 * Deterministic Seeded PRNG (Mulberry32)
 * Never use Math.random() in simulation logic.
 */

export class SeededRNG {
  private state: number;
  public readonly initialSeed: number;

  constructor(seed = 0x5eed2026) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  public getState(): number {
    return this.state >>> 0;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Returns a float in [0, 1) */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max) */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Picks a random element from a non-empty array */
  public pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Returns true with probability p in [0, 1] */
  public chance(p: number): boolean {
    return this.next() < p;
  }
}
