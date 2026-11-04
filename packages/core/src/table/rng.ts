/**
 * Seeded random numbers (mulberry32). The whole generator state is one 32-bit
 * integer stored in the table, so shuffles and rolls replay exactly.
 */
export function nextRandom(state: number): [value: number, state: number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Random integer in `[0, n)`. */
export function nextInt(state: number, n: number): [value: number, state: number] {
  const [r, s] = nextRandom(state);
  return [Math.floor(r * n), s];
}

/** Fisher-Yates shuffle of a copy of `items`. */
export function shuffled<T>(items: readonly T[], state: number): [items: T[], state: number] {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = nextInt(s, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return [out, s];
}

/** Turns any seed into a valid starting state. */
export function seedState(seed: number): number {
  return seed | 0;
}
