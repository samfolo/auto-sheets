/**
 * `factory clone check`: starts the clone in a workspace and runs recorded cases on it, as a
 * build's final check does. It is the one way a person checks a clone: re-checking an earlier
 * build against cases added since, or watching one case run with `--headed`.
 */
import { join } from 'node:path';
import { renderVerdicts, reportVerdicts, selectCases, type Verdict } from '../cases/index.ts';
import type { CommandRegistry } from '../cli/index.ts';
import { PATHS, PROJECT, type Result, type Trace } from '../kernel/index.ts';
import { checkClone } from './check.ts';

/** Where a check from the command line keeps the clone's output and pictures. */
const CHECK_OUTPUT = {
  log: join(PATHS.artifacts, 'clone-check', 'app.log'),
  screenshots: join(PATHS.artifacts, 'clone-check', 'screenshots'),
} as const;

export const checkWorkspace = async (
  workspace: string,
  ids: readonly string[],
  headed: boolean,
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const cases = await selectCases({ ids });
  if (!cases.success) return cases;
  const verdicts = await checkClone(
    workspace,
    { cases: cases.data, headed, logFile: CHECK_OUTPUT.log, screenshots: CHECK_OUTPUT.screenshots },
    trace,
  );
  if (!verdicts.success) return verdicts;
  return reportVerdicts(
    verdicts.data,
    `Watch one case run with \`${PROJECT.cli} clone check ${workspace} <id> --headed\`.`,
  );
};

export const registerCloneCommands = ({ program, run }: CommandRegistry): void => {
  const clone = program.command('clone').description('clones: what a build produced');
  clone
    .command('check')
    .description('start the clone in a workspace and run recorded cases on it')
    .argument('<workspace>', 'the build workspace holding the clone')
    .argument('[ids...]', 'the cases to run; every recorded case if none are given')
    .option('--headed', 'show the browser window while the cases run')
    .action((workspace, ids, { headed }) =>
      run(
        'clone check',
        (trace) => checkWorkspace(workspace, ids, headed === true, trace),
        renderVerdicts,
      ),
    );
};
