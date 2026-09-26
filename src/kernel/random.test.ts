import { describe, expect, it } from 'vitest';
import { seededRandom } from './random.ts';

const draw = (seed: string, count: number): number[] => {
  const random = seededRandom(seed);
  return Array.from({ length: count }, random);
};

describe('seededRandom', () => {
  it('gives the same numbers for the same seed', () => {
    expect(draw('explore:1:1', 20)).toEqual(draw('explore:1:1', 20));
  });

  it('gives different numbers for different seeds', () => {
    expect(draw('explore:1:1', 20)).not.toEqual(draw('explore:1:2', 20));
  });

  it('stays within [0, 1) and spreads across it', () => {
    const numbers = draw('spread', 1_000);
    expect(numbers.every((number) => number >= 0 && number < 1)).toBe(true);
    expect(numbers.filter((number) => number < 0.5).length).toBeGreaterThan(400);
    expect(numbers.filter((number) => number < 0.5).length).toBeLessThan(600);
  });
});
