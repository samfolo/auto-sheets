import { createHash } from 'node:crypto';

/** How many bytes of each hash become a number, and how many values those bytes can hold. */
const DRAW_BYTES = 4;
const DRAW_RANGE = 2 ** (DRAW_BYTES * 8);

/** A source of numbers in [0, 1). */
export type Random = () => number;

/**
 * Numbers in [0, 1) that are the same for the same seed, so anything generated from them can be
 * generated again. Each draw is the start of the SHA-256 hash of the seed and the draw's number:
 * slower than an arithmetic generator, but evidently deterministic and well mixed, and fast
 * enough for the hundreds of draws the factory makes.
 */
export const seededRandom = (seed: string): Random => {
  const draws = { made: 0 };
  return () => {
    draws.made += 1;
    const hash = createHash('sha256').update(`${seed}:${draws.made}`).digest();
    return hash.readUIntBE(0, DRAW_BYTES) / DRAW_RANGE;
  };
};

/** A whole number from 1 to `count`, each equally likely. One draw. */
export const upTo = (random: Random, count: number): number => 1 + Math.floor(random() * count);

/** One of the items, each equally likely. One draw. */
export const pick = <T>(random: Random, items: readonly T[]): T => {
  const item = items[upTo(random, items.length) - 1];
  // Only a bug asks for one of nothing.
  if (item === undefined) throw new Error('Picked from an empty list.');
  return item;
};

/** Whether something with the given probability happens. One draw. */
export const chance = (random: Random, probability: number): boolean => random() < probability;
