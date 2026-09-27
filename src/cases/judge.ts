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
import { attempt, fail, inOrder, ok, type Result, type Trace } from '../kernel/index.ts';
import { createSheetDriver } from '../sheet/index.ts';

/** Joins a case id's folders in a screenshot's file name. */
const SCREENSHOT_SEPARATOR = '--';

/** A case with its reference read: what a judge compares against, fixed when it was loaded. */
export interface RecordedCase extends LoadedCase {
  readonly reference: Reference;
}

/** Which recorded cases to load: some by id, or every one, less any with an excluded tag. */
export interface CaseSelection {
  /** The cases to load; every recorded case when empty. */
  readonly ids: readonly string[];
  /** Leaves out cases with any of these tags, such as the held-out ones. */
  readonly withoutTags?: readonly string[];
}

export interface VerifyOptions {
  /** Where the clone is running. */
  readonly url: string;
  /** The cases to run, as they were when they were selected. */
  readonly cases: readonly RecordedCase[];
  /** A folder for a picture of the clone at the end of each case, for a person to compare. */
  readonly screenshots?: string;
  /** Show the browser window while the cases run. */
  readonly headed: boolean;
}

/** What's wrong with a clone's run of a case: each difference from Excel, or why it didn't run. */
const problemsWith = (reference: Reference, actual: Result<Checkpoint[]>): string[] =>
  actual.success
    ? compareTrajectories(reference.checkpoints, actual.data).map(formatDifference)
    : [actual.error.message, ...(actual.error.details ?? [])];

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

/**
 * Loads recorded cases with their references, so that everything judged from them later is
 * judged against what existed now, whatever is recorded meanwhile.
 */
export const selectCases = async ({
  ids,
  withoutTags = [],
}: CaseSelection): Promise<Result<RecordedCase[]>> => {
  const loaded = await loadCases(ids);
  if (!loaded.success) return loaded;
  const wanted = loaded.data.filter(
    ({ recorded, definition }) =>
      recorded && !definition.tags.some((tag) => withoutTags.includes(tag)),
  );
  const references = await Promise.all(wanted.map(readReference));
  const failure = references.find((result) => !result.success);
  if (failure !== undefined && !failure.success) return failure;
  return ok(
    wanted.flatMap((loadedCase, index) => {
      const reference = references[index];
      return reference?.success ? [{ ...loadedCase, reference: reference.data }] : [];
    }),
  );
};

/**
 * Runs the cases on the clone and returns a verdict for each. Only problems with running the
 * check itself are failures here; a case that differs from Excel is a verdict.
 */
export const judgeClone = async (
  { url, headed, screenshots, cases }: VerifyOptions,
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const running = await checkRunning(url);
  if (!running.success) return running;

  return withFreshBrowser(
    async (context) => {
      const driver = createSheetDriver(cloneTarget(context, url), trace);
      // Cases share one browser and one clone, so they run one at a time.
      return inOrder(cases, async (loaded): Promise<Result<Verdict>> => {
        const actual = await runSteps(driver, loaded.definition.steps, loaded.seedFile);
        if (screenshots !== undefined) {
          await driver.capture(
            join(screenshots, `${loaded.id.replaceAll('/', SCREENSHOT_SEPARATOR)}.png`),
          );
        }
        const problems = problemsWith(loaded.reference, actual);
        trace('case.verdict', { id: loaded.id, passed: problems.length === 0, problems });
        return ok({
          id: loaded.id,
          tags: loaded.definition.tags,
          passed: problems.length === 0,
          problems,
        });
      });
    },
    { headless: !headed },
  );
};
