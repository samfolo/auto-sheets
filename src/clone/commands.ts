/**
 * `factory clone check`: starts the clone in a build's workspace and runs every recorded case on
 * it, as a build's final check does. It re-checks an earlier build against cases added since.
 */
import { join } from 'node:path';
import { renderVerdicts, reportVerdicts, type Verdict } from '../cases/index.ts';
import type { CommandRegistry } from '../cli/index.ts';
import { PATHS, PROJECT, type Result, type Trace } from '../kernel/index.ts';
import { checkClone } from './check.ts';

/** The clone's output while it is checked from the command line. */
const CHECK_LOG = join(PATHS.artifacts, 'clone-check.log');

export const checkWorkspace = async (
  workspace: string,
  ids: readonly string[],
  trace: Trace,
): Promise<Result<Verdict[]>> => {
  const verdicts = await checkClone(workspace, { ids, logFile: CHECK_LOG }, trace);
  if (!verdicts.success) return verdicts;
  return reportVerdicts(
    verdicts.data,
    `Start the clone with \`npm start\` in ${workspace}, then watch one case with \`${PROJECT.cli} case verify <id> --url <its address> --headed\`.`,
  );
};

export const registerCloneCommands = ({ program, run }: CommandRegistry): void => {
  const clone = program.command('clone').description('clones: what a build produced');
  clone
    .command('check')
    .description('start the clone in a workspace and run recorded cases on it')
    .argument('<workspace>', 'the build workspace holding the clone')
    .argument('[ids...]', 'the cases to run; every recorded case if none are given')
    .action((workspace, ids) =>
      run('clone check', (trace) => checkWorkspace(workspace, ids, trace), renderVerdicts),
    );
};
