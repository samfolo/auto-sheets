import { type Step, performStep, type Driver } from '../sheet/index.ts';
import type { Checkpoint } from './contract.ts';
import { formatPath, ok, type Result } from '../kernel/index.ts';

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
