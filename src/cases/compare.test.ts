import { describe, expect, it } from 'vitest';
import type { Checkpoint } from '../contracts/reference.ts';
import { compareTrajectories, formatDifference } from './compare.ts';

const checkpoint = (step: number, display: string): Checkpoint => ({
  step,
  cells: { A3: { raw: '=A1+A2', display, annotations: ['Contains Formula'] } },
});

describe('compareTrajectories', () => {
  it('finds nothing when the trajectories match', () => {
    expect(compareTrajectories([checkpoint(3, '5')], [checkpoint(3, '5')])).toEqual([]);
  });

  it.each([
    {
      problem: 'a cell that shows something else',
      actual: [checkpoint(3, '6')],
      line: 'steps[3] A3 display: expected "5", got "6"',
    },
    {
      problem: 'a checkpoint that is missing',
      actual: [],
      line: 'steps[3]: the checkpoint is missing',
    },
    {
      problem: 'a cell that was not observed',
      actual: [{ step: 3, cells: {} }],
      line: 'steps[3] A3: the cell was not observed',
    },
  ])('reports $problem, pointing at the step', ({ actual, line }) => {
    const differences = compareTrajectories([checkpoint(3, '5')], actual);
    expect(differences.map(formatDifference)).toEqual([line]);
  });
});
