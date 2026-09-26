import { describe, expect, it } from 'vitest';
import type { Verdict } from '../cases/index.ts';
import { createScoreboard, formatScoreReport } from './scoreboard.ts';

/** Verdicts from a shorthand: each case id with whether it passed. */
const check = (results: Readonly<Partial<Record<string, boolean>>>): Verdict[] =>
  Object.entries(results).flatMap(([id, passed]) =>
    passed === undefined
      ? []
      : [{ id, tags: [], passed, problems: passed ? [] : [`${id} differs`] }],
  );

interface Row {
  readonly change: string;
  readonly checks: readonly Readonly<Record<string, boolean>>[];
  readonly expected: Readonly<Record<string, unknown>>;
}

describe('createScoreboard', () => {
  it.each<Row>([
    {
      change: 'the first check',
      checks: [{ a: true, b: false }],
      expected: { passed: 1, total: 2, before: null, fixed: [], broken: [] },
    },
    {
      change: 'a fix',
      checks: [
        { a: true, b: false },
        { a: true, b: true },
      ],
      expected: { passed: 2, total: 2, before: { passed: 1, total: 2 }, fixed: ['b'], broken: [] },
    },
    {
      change: 'a regression',
      checks: [
        { a: true, b: true },
        { a: false, b: true },
      ],
      expected: { passed: 1, total: 2, before: { passed: 2, total: 2 }, fixed: [], broken: ['a'] },
    },
    {
      change: 'a check of one case, compared with its own last result',
      checks: [{ a: true, b: false }, { b: true }],
      expected: { passed: 1, total: 1, before: { passed: 0, total: 1 }, fixed: ['b'], broken: [] },
    },
    {
      change: 'a case not checked before',
      checks: [{ a: true }, { a: true, c: false }],
      expected: { passed: 1, total: 2, before: { passed: 1, total: 1 }, fixed: [], broken: [] },
    },
  ])('reports $change', ({ checks, expected }) => {
    const scoreboard = createScoreboard();
    const reports = checks.map((results) => scoreboard.record(check(results)));
    expect(reports.at(-1)).toMatchObject(expected);
  });
});

describe('formatScoreReport', () => {
  it.each([
    { history: 'nothing checked before', first: {}, suffix: '.' },
    {
      history: 'the same cases checked before',
      first: { a: true, b: true },
      suffix: ' (2 before).',
    },
    {
      history: 'some cases checked before',
      first: { a: true },
      suffix: ' (1 of the 1 checked before).',
    },
  ])('compares the score with $history', ({ first, suffix }) => {
    const scoreboard = createScoreboard();
    scoreboard.record(check(first));
    const [score] = formatScoreReport(scoreboard.record(check({ a: true, b: true }))).split('\n');
    expect(score).toBe(`2 of 2 cases match the original${suffix}`);
  });

  it('leads with the score and what changed, then lists each difference', () => {
    const scoreboard = createScoreboard();
    scoreboard.record(check({ a: true, b: false }));
    const text = formatScoreReport(scoreboard.record(check({ a: false, b: true })));
    expect(text.split('\n')).toEqual([
      '1 of 2 cases match the original (1 before).',
      'Fixed since the last check: b.',
      'Broken since the last check: a. Your last change undid behaviour that worked; look at it first.',
      '',
      '✖ a',
      '    a differs',
    ]);
  });
});
