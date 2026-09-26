import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { formatPath, validate } from './validate.ts';

const described = <S extends z.ZodType>(schema: S, description: string): S =>
  schema.meta({ description });

/** A small contract with the shapes real contracts use: nesting, arrays, unions, wrappers. */
const exampleSchema = z.object({
  name: described(z.string(), 'What the example is called.'),
  retries: described(z.number().int(), 'How many times to try again.').optional(),
  steps: z.array(
    z.discriminatedUnion('do', [
      z.object({
        do: z.literal('enter'),
        cell: described(z.string().regex(/^[A-Z]+\d+$/), 'The cell to type into, such as B7.'),
      }),
      z.object({ do: z.literal('undo') }),
    ]),
  ),
});

describe('validate', () => {
  it('passes valid data through, typed', () => {
    expect(validate(exampleSchema, { name: 'ok', steps: [] }, 'example.json')).toSucceed();
  });

  it.each([
    {
      problem: 'a missing top-level field',
      input: { steps: [] },
      lines: [
        '✖ Invalid input: expected string, received undefined',
        '  → at name: What the example is called.',
      ],
    },
    {
      problem: 'a wrapped optional field',
      input: { name: 'x', retries: 1.5, steps: [] },
      lines: [
        '✖ Invalid input: expected int, received number',
        '  → at retries: How many times to try again.',
      ],
    },
    {
      problem: 'a field inside the chosen member of a union, inside an array',
      input: { name: 'x', steps: [{ do: 'undo' }, { do: 'enter', cell: 'b7' }] },
      lines: [
        '✖ Invalid string: must match pattern /^[A-Z]+\\d+$/',
        '  → at steps[1].cell: The cell to type into, such as B7.',
      ],
    },
  ])('describes $problem', ({ input, lines }) => {
    expect(validate(exampleSchema, input, 'example.json')).toFailWith('CONTRACT_VIOLATION', {
      message: 'example.json does not match its contract.',
      location: 'example.json',
      details: lines,
    });
  });
});

describe('formatPath', () => {
  it.each([
    { path: [], text: 'the top level' },
    { path: ['name'], text: 'name' },
    { path: ['steps', 3, 'cell'], text: 'steps[3].cell' },
  ])('formats $text', ({ path, text }) => {
    expect(formatPath(path)).toBe(text);
  });
});
