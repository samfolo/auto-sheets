/**
 * Trying steps on a clone: the same driver the checker uses, run on a fresh copy of the clone
 * with any steps, not only a recorded case's. It answers with what each observe step saw and
 * the controls on the screen at the end, so whoever is debugging the clone (a person or its
 * agent) sees exactly what the checker sees, without writing a browser script.
 */
import { cloneTarget } from '../../targets/excel/index.ts';
import { listControls, withFreshBrowser, type Control } from '../browser/index.ts';
import { runSteps, type Checkpoint } from '../cases/index.ts';
import { ok, type Result, type Trace } from '../kernel/index.ts';
import { createSheetDriver, type Step } from '../sheet/index.ts';
import { withCloneApp } from './app.ts';

export interface Tried {
  readonly checkpoints: readonly Checkpoint[];
  /** The controls on the clone's screen after the last step. */
  readonly controls: readonly Control[];
}

/** Starts the clone in the workspace, runs the steps on a blank sheet, and stops it. */
export const trySteps = (
  workspace: string,
  steps: readonly Step[],
  logFile: string,
  trace: Trace,
): Promise<Result<Tried>> =>
  withCloneApp(workspace, logFile, (url) =>
    withFreshBrowser(
      async (context) => {
        const checkpoints = await runSteps(
          createSheetDriver(cloneTarget(context, url), trace),
          steps,
        );
        if (!checkpoints.success) return checkpoints;
        const page = context.pages().at(-1);
        const controls = page === undefined ? ok([]) : await listControls(page);
        if (!controls.success) return controls;
        return ok({ checkpoints: checkpoints.data, controls: controls.data });
      },
      { headless: true },
    ),
  );
