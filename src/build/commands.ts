import type { CommandRegistry } from '../cli/index.ts';
import { build, renderBuild } from './build.ts';

/** `factory build`: one attempt by the agent to build a clone, and the factory's verdict on it. */
export const registerBuildCommands = ({ program, run }: CommandRegistry): void => {
  program
    .command('build')
    .description('have the agent build a clone from scratch in a new workspace, then check it')
    .requiredOption('--out <dir>', 'a new directory outside the factory for the workspace')
    .option('--minutes <minutes>', 'how long the agent may work', '30')
    .action(({ out, minutes }) =>
      run('build', (trace) => build({ out, minutes }, trace), renderBuild),
    );
};
