/**
 * Checking a clone built in a workspace: start it, run recorded cases on it, stop it. The score
 * counts cases by kind, so a build can say how the clone did on the cases its agent saw, on the
 * held-out cases it never saw, and on the golden walkthrough.
 */
import { CASE_TAGS, judgeClone, type Verdict, type VerifyOptions } from '../cases/index.ts';
import type { Result, Trace } from '../kernel/index.ts';
import { withCloneApp } from './app.ts';
import type { CloneScore, Tally } from './contract.ts';

export const tally = (verdicts: readonly Verdict[]): Tally => ({
  passed: verdicts.filter((verdict) => verdict.passed).length,
  total: verdicts.length,
});

const tagged = (verdicts: readonly Verdict[], tag: string): Verdict[] =>
  verdicts.filter((verdict) => verdict.tags.includes(tag));

export const scoreClone = (verdicts: readonly Verdict[]): CloneScore => ({
  seen: tally(verdicts.filter((verdict) => !verdict.tags.includes(CASE_TAGS.heldOut))),
  heldOut: tally(tagged(verdicts, CASE_TAGS.heldOut)),
  golden: tally(tagged(verdicts, CASE_TAGS.golden)),
});

export type CheckOptions = Pick<VerifyOptions, 'ids' | 'withoutTags'> & {
  /** Where the clone's own output goes. */
  readonly logFile: string;
};

/** Starts the clone in the workspace, runs the cases on it headlessly, and stops it. */
export const checkClone = (
  workspace: string,
  { logFile, ...selection }: CheckOptions,
  trace: Trace,
): Promise<Result<Verdict[]>> =>
  withCloneApp(workspace, logFile, (url) =>
    judgeClone({ url, headed: false, ...selection }, trace),
  );
