/**
 * The CLI: one program assembled from the commands each slice registers. The root owns what every
 * command shares: `--json` output, reporting rejected command lines, logging and exit codes.
 */
import { Command, CommanderError } from '@commander-js/extra-typings';
import { registerExcelCommands } from '../../targets/excel/index.ts';
import { registerAgentCommands } from '../agent/index.ts';
import { registerBrowserCommands } from '../browser/index.ts';
import { registerBuildCommands } from '../build/index.ts';
import { registerCaseCommands } from '../cases/index.ts';
import { registerCloneCommands } from '../clone/index.ts';
import { registerDoctorCommands } from '../doctor/index.ts';
import {
  exitCodeFor,
  PROJECT,
  fail,
  type Result,
  type Telemetry,
  sentence,
} from '../kernel/index.ts';
import type { CommandRegistry, RegisterCommands } from './registry.ts';
import { render } from './render.ts';
import { internalError, runCommand, write } from './run-command.ts';

const DESCRIPTION =
  'Replicate a slice of a closed-source product, and prove the clone behaves the same.';

/** The option that switches every command's output to one line of JSON. */
const JSON_FLAG = '--json';

/** Each slice's commands, in the order `--help` lists them. */
const REGISTRATIONS: readonly RegisterCommands[] = [
  registerDoctorCommands,
  registerAgentCommands,
  registerBuildCommands,
  registerBrowserCommands,
  registerExcelCommands,
  registerCaseCommands,
  registerCloneCommands,
];

/** What commander calls a bare `factory`, which prints the help to stderr. */
const NO_COMMAND = 'commander.help';

/** Reports a failure that happened outside any command, in the format every command uses. */
const report = (failure: Result<never>, argv: readonly string[]): void =>
  write(render(failure, argv.includes(JSON_FLAG), () => ''));

/** Reports a command line that commander rejected, such as an unknown command or option. */
const reportUsageError = (
  error: CommanderError,
  argv: readonly string[],
  telemetry: Telemetry,
): void => {
  // --help and --version exit successfully; commander has already printed them.
  if (error.exitCode === 0) return;
  if (error.code === NO_COMMAND) {
    process.exitCode = exitCodeFor('INVALID_USAGE');
    return;
  }
  telemetry.logger.warn({ argv, reason: error.code }, 'usage.invalid');
  // Commander's messages look like "error: unknown command 'x'\n(Did you mean y?)".
  const [first = '', ...rest] = error.message.replace(/^error: /, '').split('\n');
  report(
    fail('INVALID_USAGE', sentence(first), {
      details: rest.length > 0 ? rest : undefined,
      hint: `Run \`${PROJECT.cli} --help\` to see the commands and their options.`,
    }),
    argv,
  );
};

const createProgram = (argv: readonly string[], telemetry: Telemetry) => {
  const program = new Command(PROJECT.cli)
    .description(DESCRIPTION)
    .version(PROJECT.version)
    .option(JSON_FLAG, 'print the result as one line of JSON, for agents and scripts')
    .exitOverride()
    // Rejected command lines are reported like any other failure, by reportUsageError.
    .configureOutput({ outputError: () => {} });

  const registry: CommandRegistry = {
    program,
    run: (command, action, renderData) =>
      runCommand(
        { command, argv, json: program.opts().json === true, telemetry },
        action,
        renderData,
      ),
  };
  for (const register of REGISTRATIONS) register(registry);
  return program;
};

/** Parses the command line and runs the command it names. */
export const runProgram = async (argv: readonly string[], telemetry: Telemetry): Promise<void> => {
  try {
    await createProgram(argv, telemetry).parseAsync();
  } catch (error) {
    if (error instanceof CommanderError) reportUsageError(error, argv, telemetry);
    else report(internalError(error, telemetry), argv);
  }
};

/** Reports settings that stop the CLI from starting at all. */
export const reportStartupFailure = report;
