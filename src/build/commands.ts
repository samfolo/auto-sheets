import { DEFAULT_AGENT } from '../agent/index.ts';
import type { CommandRegistry } from '../cli/index.ts';
import { build, renderBuild } from './build.ts';
import { renderRun, showRun } from './report.ts';

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
    .option('--minutes <minutes>', 'how long the agent may work; by default its own budget')
    .action((options) => run('build', (trace) => build(options, trace), renderBuild));

  program
    .command('runs')
    .description('runs: what each build did, from its summary and log')
    .command('show')
    .description('show a run at a glance: outcome, time, cost and how its score moved')
    .argument('[run]', 'the run id, a folder under artifacts/runs; by default the latest')
    .action((id) => run('runs show', () => showRun(id), renderRun));
};
