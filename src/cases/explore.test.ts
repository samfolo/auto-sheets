import { describe, expect, it } from 'vitest';
import { caseSchema, exploreOptionsSchema } from './contract.ts';
import { exploredCase, exploredId } from './explore.ts';
import { listCaseIds, loadAllCases } from './repository.ts';

/** How a committed explored case was generated, read back from its id and description. */
const generatedBy = (id: string, description: string) => {
  const [, focus = 'mixed', seed, index] = /^explore\/(?:(\w+)-)?seed-(\d+)-(\d+)$/.exec(id) ?? [];
  const [, length] = /sequence of (\d+) random/.exec(description) ?? [];
  return {
    focus: exploreOptionsSchema.shape.focus.parse(focus),
    seed: Number(seed),
    index: Number(index),
    length: Number(length),
  };
};

describe('committed explored cases', async () => {
  const loaded = await loadAllCases();
  const explored = loaded.success ? loaded.data.filter(({ id }) => id.startsWith('explore/')) : [];

  it('exist', async () => {
    expect((await listCaseIds()).some((id) => id.startsWith('explore/'))).toBe(true);
    expect(explored.length).toBeGreaterThan(0);
  });

  it.each(explored.map(({ id, definition }) => [id, definition] as const))(
    '%s is generated again, step for step, from its seed',
    (id, definition) => {
      const { focus, seed, index, length } = generatedBy(id, definition.description);
      expect(exploredId(focus, seed, index)).toBe(id);
      // Descriptions have been reworded since some were written; the steps are what was recorded.
      expect(exploredCase(seed, index, length, focus).steps).toEqual(definition.steps);
    },
  );
});

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

describe('the entry focus', () => {
  it.each([1, 2, 3, 4, 5])(
    'writes a valid case that observes what it entered (number %i)',
    (index) => {
      const explored = exploredCase(9, index, 8, 'entry');
      expect(caseSchema.safeParse(explored).success).toBe(true);
      expect(explored.steps.some((step) => step.do === 'observe')).toBe(true);
    },
  );

  it('refers to cells it wrote earlier in its formulas', () => {
    const typed = Array.from({ length: 20 }, (_, index) => exploredCase(9, index + 1, 8, 'entry'))
      .flatMap(({ steps }) => steps)
      .flatMap((step) => ('text' in step ? [step.text] : []));
    expect(typed.some((text) => /^=(SUM|AVERAGE|MAX|MIN|COUNT|IF|ROUND)\(/.test(text))).toBe(true);
  });
});
