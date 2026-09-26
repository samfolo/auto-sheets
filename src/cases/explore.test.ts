import { describe, expect, it } from 'vitest';
import { caseSchema } from './contract.ts';
import { exploredCase } from './explore.ts';

describe('exploredCase', () => {
  it('gives the same case for the same seed, so an exploration can be repeated', () => {
    expect(exploredCase(42, 1, 6)).toEqual(exploredCase(42, 1, 6));
  });

  it('gives different cases for different seeds and numbers', () => {
    expect(exploredCase(42, 1, 6)).not.toEqual(exploredCase(42, 2, 6));
    expect(exploredCase(42, 1, 6)).not.toEqual(exploredCase(43, 1, 6));
  });

  it.each([1, 2, 3, 4, 5])(
    'writes a valid case, observing after each gesture (number %i)',
    (index) => {
      const explored = exploredCase(7, index, 6);
      expect(caseSchema.safeParse(explored).success).toBe(true);
      expect(explored.steps.filter((step) => step.do === 'observe-selection')).toHaveLength(6);
    },
  );
});
