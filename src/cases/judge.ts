/**
 * Judging a clone: runs recorded cases on it and compares what it shows with what Excel showed.
 * The references come from the factory's own cases, so a clone's workspace can't change what
 * it's judged against.
 */
import { join } from 'node:path';
import { cloneTarget, CLONE } from '../../targets/excel/index.ts';
import { withFreshBrowser } from '../browser/index.ts';
import { compareTrajectories, formatDifference } from './compare.ts';
import { loadAllCases, loadCase, readReference, type LoadedCase } from './repository.ts';
import { runSteps } from './run.ts';
import type { Checkpoint, Reference, Verdict } from './contract.ts';
import { attempt, fail, ok, type Result, type Trace } from '../kernel/index.ts';
import { createSheetDriver } from '../sheet/index.ts';

/** Joins a case id's folders in a screenshot's file name. */
const SCREENSHOT_SEPARATOR = '--';

export interface VerifyOptions {
  /** Where the clone is running. */
  readonly url: string;
  /** The cases to run; every recorded case when empty. */
  readonly ids: readonly string[];
  /** Leaves out cases with any of these tags, such as held-out cases while an agent works. */
  readonly withoutTags?: readonly string[];
  /** A folder for a picture of the clone at the end of each case, for a person to compare. */
  readonly screenshots?: string;
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

const loadCases = async (ids: readonly string[]): Promise<Result<LoadedCase[]>> => {
  if (ids.length === 0) return loadAllCases();
  const loaded = await Promise.all(ids.map(loadCase));
  const failure = loaded.find((result) => !result.success);
  if (failure !== undefined && !failure.success) return failure;
  return ok(loaded.flatMap((result) => (result.success ? [result.data] : [])));
};

/** The recorded cases to run: the ones asked for, or every one, less any with an excluded tag. */
export const selectCases = async ({
  ids,
  withoutTags = [],
}: Pick<VerifyOptions, 'ids' | 'withoutTags'>): Promise<Result<LoadedCase[]>> => {
  const loaded = await loadCases(ids);
  if (!loaded.success) return loaded;
  return ok(
    loaded.data.filter(
      ({ recorded, definition }) =>
        recorded && !definition.tags.some((tag) => withoutTags.includes(tag)),
    ),
  );
};

/**
 * Runs the cases on the clone and returns a verdict for each. Only problems with running the
 * check itself are failures here; a case that differs from Excel is a verdict.
 */
export const judgeClone = async (
  { url, headed, screenshots, ...selection }: VerifyOptions,
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const running = await checkRunning(url);
  if (!running.success) return running;
  const cases = await selectCases(selection);
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
        if (screenshots !== undefined) {
          // oxlint-disable-next-line no-await-in-loop
          await driver.capture(
            join(screenshots, `${loaded.id.replaceAll('/', SCREENSHOT_SEPARATOR)}.png`),
          );
        }
        const problems = problemsWith(reference, actual);
        trace('case.verdict', { id: loaded.id, passed: problems.length === 0, problems });
        results.push({
          id: loaded.id,
          tags: loaded.definition.tags,
          passed: problems.length === 0,
          problems,
        });
      }
      return ok(results);
    },
    { headless: !headed },
  );
};
