import { DEFAULT_AGENT } from '../agent/index.ts';
import type { CommandRegistry } from '../cli/index.ts';
import { build, renderBuild } from './build.ts';
import { listRuns, renderRun, renderRuns, showRun } from './report.ts';

/**
 * `factory build`: one attempt by an agent to build a clone, and the factory's verdict on it.
 * `factory runs show`: one run at a glance, afterwards.
 */
export const registerBuildCommands = ({ program, run }: CommandRegistry): void => {
  program
    .command('build')
    .description('have an agent build a clone from scratch in a new workspace, then check it')
    .option('--agent <name>', 'the agent, a folder under agents/', DEFAULT_AGENT)
    .option('--out <dir>', 'a new directory outside the factory; by default named after the run')
    .option('--model <provider/id>', 'another model for this build only, to compare models')
    .option('--minutes <minutes>', 'how long the agent may work; by default its own budget')
    .option('--max-usd <dollars>', 'stop the agent once its model calls have cost this much')
    .action((options) => run('build', (trace) => build(options, trace), renderBuild));

  const runs = program
    .command('runs')
    .description('runs: what each build did, from its summary and log');
  runs
    .command('list')
    .description('list every finished run: model, time, cost, outcome and score')
    .action(() => run('runs list', listRuns, renderRuns));
  runs
    .command('show')
    .description('show a run at a glance: outcome, time, cost and how its score moved')
    .argument('[run]', 'the run id, a folder under artifacts/runs; by default the latest')
    .action((id) => run('runs show', () => showRun(id), renderRun));
};
