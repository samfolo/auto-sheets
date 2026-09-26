import type { CellAddress, Step } from '../contracts/case.ts';
import type { CellObservation, Checkpoint } from '../contracts/reference.ts';
import { formatPath } from '../contracts/validate.ts';
import { ok, type Result } from '../core/result.ts';
import type { Driver } from './driver.ts';

type Observed = Checkpoint['cells'];

/** Adds which step failed to a failure, so the report points at the step in case.json. */
const atStep = <T>(result: Result<T>, index: number): Result<T> =>
  result.success
    ? result
    : {
        success: false,
        error: {
          ...result.error,
          details: [`at ${formatPath(['steps', index])}`, ...(result.error.details ?? [])],
        },
      };

/** Observes each cell in turn and returns what each one showed, by address. */
export const observeCells = async (
  driver: Driver,
  cells: readonly CellAddress[],
): Promise<Result<Observed>> => {
  const observed: Record<CellAddress, CellObservation> = {};
  for (const cell of cells) {
    // Observing a cell selects it, so cells are read one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const observation = await driver.observe(cell);
    if (!observation.success) return observation;
    observed[cell] = observation.data;
  }
  return ok(observed);
};

/** Does one step. An observe step returns what it saw; every other step returns null. */
export const performStep = async (driver: Driver, step: Step): Promise<Result<Observed | null>> => {
  if (step.do === 'observe') return observeCells(driver, step.cells);
  const done = await driver.perform(step);
  return done.success ? ok(null) : done;
};

/**
 * Runs a case's steps on a new sheet, blank or seeded, and returns what was seen at each observe
 * step. The same steps run on Excel to record a reference, and on the clone to compare with it.
 */
export const runSteps = async (
  driver: Driver,
  steps: readonly Step[],
  seed: string | null = null,
): Promise<Result<Checkpoint[]>> => {
  const opened = await driver.open(seed);
  if (!opened.success) return opened;
  const checkpoints: Checkpoint[] = [];
  for (const [index, step] of steps.entries()) {
    // Steps drive one user interface and must happen in order.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = atStep(await performStep(driver, step), index);
    if (!outcome.success) return outcome;
    if (outcome.data !== null) checkpoints.push({ step: index, cells: outcome.data });
  }
  return ok(checkpoints);
};
