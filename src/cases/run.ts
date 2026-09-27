import { type Step, performStep, type Driver } from '../sheet/index.ts';
import type { Checkpoint } from './contract.ts';
import { formatPath, inOrder, ok, type Result } from '../kernel/index.ts';

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
  // Steps drive one user interface, so they happen in order.
  const seen = await inOrder(steps, async (step, index) =>
    atStep(await performStep(driver, step), index),
  );
  if (!seen.success) return seen;
  return ok(
    seen.data.flatMap((observation, index) =>
      observation === null ? [] : [{ step: index, ...observation }],
    ),
  );
};
