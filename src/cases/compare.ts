import type { CellObservation } from '../sheet/index.ts';
import type { Checkpoint } from './contract.ts';
import { formatPath } from '../kernel/index.ts';

/** One way two trajectories disagree: a cell field, or a checkpoint or cell that's missing. */
export interface Difference {
  /** The index of the observe step in case.json. */
  readonly step: number;
  /** The cell, or null when a whole checkpoint is missing. */
  readonly cell: string | null;
  readonly field: keyof CellObservation | 'checkpoint' | 'cell';
  readonly expected: unknown;
  readonly actual: unknown;
}

const FIELDS = ['raw', 'display', 'annotations'] as const satisfies (keyof CellObservation)[];

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const compareCells = (step: number, expected: Checkpoint, actual: Checkpoint): Difference[] =>
  Object.entries(expected.cells).flatMap(([cell, want]): Difference[] => {
    const got = actual.cells[cell];
    if (got === undefined)
      return [{ step, cell, field: 'cell', expected: want, actual: undefined }];
    return FIELDS.filter((field) => !sameValue(want[field], got[field])).map((field) => ({
      step,
      cell,
      field,
      expected: want[field],
      actual: got[field],
    }));
  });

/** Every difference between an expected trajectory and an actual one, in step order. */
export const compareTrajectories = (
  expected: readonly Checkpoint[],
  actual: readonly Checkpoint[],
): Difference[] =>
  expected.flatMap((want): Difference[] => {
    const got = actual.find((checkpoint) => checkpoint.step === want.step);
    return got === undefined
      ? [{ step: want.step, cell: null, field: 'checkpoint', expected: want, actual: undefined }]
      : compareCells(want.step, want, got);
  });

/** One line per difference, pointing at the observe step in case.json. */
export const formatDifference = ({ step, cell, field, expected, actual }: Difference): string => {
  const where = formatPath(['steps', step]);
  if (cell === null) return `${where}: the checkpoint is missing`;
  if (field === 'cell') return `${where} ${cell}: the cell was not observed`;
  return `${where} ${cell} ${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
};
