import { createHash } from 'node:crypto';

/** How many bytes of each hash become a number, and how many values those bytes can hold. */
const DRAW_BYTES = 4;
const DRAW_RANGE = 2 ** (DRAW_BYTES * 8);

/**
 * Numbers in [0, 1) that are the same for the same seed, so anything generated from them can be
 * generated again. Each draw is the start of the SHA-256 hash of the seed and the draw's number:
 * slower than an arithmetic generator, but evidently deterministic and well mixed, and fast
 * enough for the hundreds of draws the factory makes.
 */
export const seededRandom = (seed: string): (() => number) => {
  const draws = { made: 0 };
  return () => {
    draws.made += 1;
    const hash = createHash('sha256').update(`${seed}:${draws.made}`).digest();
    return hash.readUIntBE(0, DRAW_BYTES) / DRAW_RANGE;
  };
};
