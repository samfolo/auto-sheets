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

describe('the areas focus', () => {
  const explored = exploredCase(3, 1, 12, 'areas');
  const gestures = explored.steps.filter((step) => step.do !== 'observe-selection');

  it('begins with a plain drag, to have a range to add to', () => {
    expect(gestures[0]).toMatchObject({ do: 'drag' });
    expect(gestures[0]).not.toHaveProperty('hold');
  });

  it('then adds to the selection with Command held every time', () => {
    expect(
      gestures.slice(1).every((step) => 'hold' in step && step.hold?.includes('Command')),
    ).toBe(true);
  });

  it('writes a valid case', () => {
    expect(caseSchema.safeParse(explored).success).toBe(true);
  });
});
