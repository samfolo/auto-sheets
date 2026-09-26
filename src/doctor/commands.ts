import type { CommandRegistry } from '../cli/index.ts';
import { doctor, renderChecks } from './doctor.ts';

/** `factory doctor`: checks every prerequisite before anything runs. */
export const registerDoctorCommands = ({ program, run }: CommandRegistry): void => {
  program
    .command('doctor')
    .description('check that everything the factory needs is in place')
    .action(() => run('doctor', doctor, renderChecks));
};
