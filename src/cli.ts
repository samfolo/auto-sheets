#!/usr/bin/env node
import { Command, CommanderError } from '@commander-js/extra-typings';
import { doctor, renderChecks } from './commands/doctor.ts';
import { loadEnvFile, readRuntime } from './contracts/environment.ts';
import { exitCodeFor } from './contracts/errors.ts';
import { internalError, runCommand, write } from './core/command.ts';
import { project } from './core/project.ts';
import { render } from './core/render.ts';
import { fail, type Result } from './core/result.ts';
import type { Telemetry } from './core/telemetry.ts';
import { openTelemetry } from './core/telemetry.ts';
import { sentence } from './core/text.ts';

const argv = process.argv.slice(2);

/** Reports a failure that happened outside any command. */
const report = (failure: Result<never>): void =>
  write(render(failure, argv.includes('--json'), () => ''));

/** The commands, as people and agents see them in --help. */
const createProgram = (telemetry: Telemetry) => {
  const program = new Command(project.cli)
    .description(
      'Replicate a slice of a closed-source product, and prove the clone behaves the same.',
    )
    .version(project.version)
    .option('--json', 'print the result as one line of JSON, for agents and scripts')
    .exitOverride()
    // Rejected command lines are reported like any other failure, in reportUsageError.
    .configureOutput({ outputError: () => {} });

  const invocation = (command: string) => ({
    command,
    argv,
    json: program.opts().json === true,
    telemetry,
  });

  program
    .command('doctor')
    .description('check that everything the factory needs is in place')
    .action(() => runCommand(invocation('doctor'), doctor, renderChecks));

  return program;
};

/** Reports a command line that commander rejected, in the same format as any other failure. */
const reportUsageError = (error: CommanderError, telemetry: Telemetry): void => {
  // --help and --version exit successfully; commander has already printed them.
  if (error.exitCode === 0) return;
  // `factory` on its own prints the help to stderr; that is the whole report.
  if (error.code === 'commander.help') {
    process.exitCode = exitCodeFor('INVALID_USAGE');
    return;
  }
  telemetry.logger.warn({ argv, reason: error.code }, 'usage.invalid');
  // Commander's messages look like "error: unknown command 'x'\n(Did you mean y?)".
  const [first = '', ...rest] = error.message.replace(/^error: /, '').split('\n');
  report(
    fail('INVALID_USAGE', sentence(first), {
      details: rest.length > 0 ? rest : undefined,
      hint: `Run \`${project.cli} --help\` to see the commands and their options.`,
    }),
  );
};

const main = async (): Promise<void> => {
  loadEnvFile();
  const runtime = readRuntime();
  if (!runtime.success) return report(runtime);
  const telemetry = openTelemetry(runtime.data);
  try {
    await createProgram(telemetry).parseAsync();
  } catch (error) {
    if (error instanceof CommanderError) reportUsageError(error, telemetry);
    else report(internalError(error, telemetry));
  }
};

await main();
