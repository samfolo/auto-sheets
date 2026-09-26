import { describe, expect, it } from 'vitest';
import type { BuildSummary } from './contract.ts';
import { renderRun, renderRuns } from './report.ts';

const SUMMARY: BuildSummary = {
  runId: '2026-09-26T17-07-53-315Z',
  factory: { version: '0.1.0', commit: '4895a9b0c0ffee', dirty: false },
  agent: { name: 'builder', model: 'openrouter/deepseek/deepseek-v4.1-flash', thinking: 'high' },
  workspace: '/builds/2026-09-26T17-07-53-315Z',
  startedAt: '2026-09-26T17:07:53.315Z',
  finishedAt: '2026-09-26T17:39:03.315Z',
  run: {
    outcome: 'timedOut',
    error: null,
    toolCalls: 84,
    replies: 60,
    tokens: 1_234_567,
    costUsd: 0.1234,
  },
  check: {
    score: {
      seen: { passed: 9, total: 10 },
      heldOut: { passed: 1, total: 2 },
      golden: { passed: 1, total: 1 },
    },
    verdicts: [],
    problem: null,
  },
};

describe('renderRun', () => {
  it('says how the run went, how long it took, what it cost and how the score moved', () => {
    const text = renderRun({
      summary: SUMMARY,
      scores: [
        { afterMs: 252_000, passed: 3, total: 10 },
        { afterMs: 300_000, passed: 1, total: 1 },
        { afterMs: 580_000, passed: 7, total: 10 },
      ],
    });
    expect(text.split('\n')).toEqual([
      'Run 2026-09-26T17-07-53-315Z: builder on openrouter/deepseek/deepseek-v4.1-flash, from factory 0.1.0 at 4895a9b.',
      'Took 31:10 in all. The agent stopped at its time limit after 84 tool calls and 1,234,567 tokens, for about $0.12.',
      '',
      'Checks while it worked (● every visible case):',
      '    4:12  3 of 10 ●',
      '    5:00  1 of 1',
      '    9:40  7 of 10 ●',
      '',
      'Final check: 9 of 10 seen, 1 of 2 held-out and 1 of 1 golden cases match Excel.',
    ]);
  });
});

describe('renderRuns', () => {
  it('puts each run on one line, with its model, time, cost, outcome and score', () => {
    expect(
      renderRuns([SUMMARY, { ...SUMMARY, check: { score: null, verdicts: [], problem: 'x' } }]),
    ).toBe(
      [
        '2026-09-26T17-07-53-315Z  openrouter/deepseek/deepseek-v4.1-flash            31:10   $0.12  stopped at its time limit   9 of 10 seen, 1 of 2 held out',
        '2026-09-26T17-07-53-315Z  openrouter/deepseek/deepseek-v4.1-flash            31:10   $0.12  stopped at its time limit   not checked',
      ].join('\n'),
    );
  });

  it('says when there are no runs', () => {
    expect(renderRuns([])).toBe('No finished runs with a summary yet.');
  });
});
