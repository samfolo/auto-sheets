/**
 * Judging a clone: runs recorded cases on it and compares what it shows with what Excel showed.
 * The references come from the factory's own cases, so a clone's workspace can't change what
 * it's judged against.
 */
import { cloneTarget, CLONE } from '../../targets/excel/index.ts';
import { withFreshBrowser } from '../browser/index.ts';
import { compareTrajectories, formatDifference } from './compare.ts';
import { listCaseIds, loadCase, readReference, type LoadedCase } from './repository.ts';
import { runSteps } from './run.ts';
import type { Checkpoint, Reference } from './contract.ts';
import { attempt, fail, ok, type Result, type Trace } from '../kernel/index.ts';
import { createSheetDriver } from '../sheet/index.ts';

/** How one case went on the clone. */
export interface Verdict {
  readonly id: string;
  readonly passed: boolean;
  /** Each difference from Excel, or the reason the case couldn't run. */
  readonly problems: readonly string[];
}

export interface VerifyOptions {
  /** Where the clone is running. */
  readonly url: string;
  /** The cases to run; every recorded case when empty. */
  readonly ids: readonly string[];
  /** Show the browser window while the cases run. */
  readonly headed: boolean;
}

/** What's wrong with a clone's run of a case: each difference from Excel, or why it didn't run. */
const problemsWith = (reference: Result<Reference>, actual: Result<Checkpoint[]>): string[] => {
  if (!reference.success) return [reference.error.message, ...(reference.error.details ?? [])];
  if (!actual.success) return [actual.error.message, ...(actual.error.details ?? [])];
  return compareTrajectories(reference.data.checkpoints, actual.data).map(formatDifference);
};

const checkRunning = async (url: string): Promise<Result<Response>> =>
  attempt(
    () => fetch(new URL(CLONE.api.health, url)),
    (reason) =>
      fail('CLONE_NOT_RUNNING', `Nothing is answering at ${url}.`, {
        details: [reason],
        hint: 'Start the clone with `npm start`, then run the check again.',
      }),
  );

const recordedCases = async (ids: readonly string[]): Promise<Result<LoadedCase[]>> => {
  const loaded = await Promise.all((ids.length > 0 ? ids : await listCaseIds()).map(loadCase));
  const failure = loaded.find((result) => !result.success);
  if (failure !== undefined && !failure.success) return failure;
  return ok(
    loaded.flatMap((result) => (result.success && result.data.recorded ? [result.data] : [])),
  );
};

/**
 * Runs the cases on the clone and returns a verdict for each. Only problems with running the
 * check itself are failures here; a case that differs from Excel is a verdict.
 */
export const judgeClone = async (
  { url, ids, headed }: VerifyOptions,
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const running = await checkRunning(url);
  if (!running.success) return running;
  const cases = await recordedCases(ids);
  if (!cases.success) return cases;

  return withFreshBrowser(
    async (context) => {
      const driver = createSheetDriver(cloneTarget(context, url), trace);
      const results: Verdict[] = [];
      for (const loaded of cases.data) {
        // Cases share one browser and one clone, so they run one at a time.
        // oxlint-disable-next-line no-await-in-loop
        const reference = await readReference(loaded);
        // oxlint-disable-next-line no-await-in-loop
        const actual = await runSteps(driver, loaded.definition.steps, loaded.seedFile);
        const problems = problemsWith(reference, actual);
        trace('case.verdict', { id: loaded.id, passed: problems.length === 0, problems });
        results.push({ id: loaded.id, passed: problems.length === 0, problems });
      }
      return ok(results);
    },
    { headless: !headed },
  );
};
