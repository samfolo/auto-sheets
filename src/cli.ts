#!/usr/bin/env node
import { Command, CommanderError } from '@commander-js/extra-typings';
import packageJson from '../package.json' with { type: 'json' };
import { doctor, renderChecks } from './commands/doctor.ts';
import { loadEnvFile } from './contracts/environment.ts';
import { exitCodeFor } from './contracts/errors.ts';
import { internalError, runCommand, write } from './core/command.ts';
import { render } from './core/render.ts';
import { fail, type Result } from './core/result.ts';
import { openTelemetry } from './core/telemetry.ts';

loadEnvFile();
const telemetry = openTelemetry();

const program = new Command('factory')
  .description('Replicate a slice of a closed-source product, and prove the clone behaves the same.')
  .version(packageJson.version)
  .option('--json', 'print the result as one line of JSON, for agents and scripts')
  .exitOverride()
  .configureOutput({ outputError: () => {} });

const invocation = (command: string) => ({
  command,
  json: program.opts().json === true,
  telemetry,
});

program
  .command('doctor')
  .description('check that everything the factory needs is in place')
  .action(() => runCommand(invocation('doctor'), doctor, renderChecks));

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError) reportUsageError(error);
  else report(internalError(error, telemetry));
}

/** Reports a command line that commander rejected, in the same format as any other failure. */
function reportUsageError(error: CommanderError): void {
  // --help and --version exit successfully; commander has already printed them.
  if (error.exitCode === 0) return;
  // `factory` on its own prints the help to stderr; that is the whole report.
  if (error.code === 'commander.help') {
    process.exitCode = exitCodeFor('INVALID_USAGE');
    return;
  }
  telemetry.logger.warn({ argv: process.argv.slice(2), reason: error.code }, 'usage.invalid');
  // Commander's messages look like "error: unknown command 'x'\n(Did you mean y?)".
  const [first = '', ...rest] = error.message.replace(/^error: /, '').split('\n');
  report(
    fail('INVALID_USAGE', `${first.charAt(0).toUpperCase()}${first.slice(1)}.`, {
      details: rest.length > 0 ? rest : undefined,
      hint: 'Run `factory --help` to see the commands and their options.',
    }),
  );
}

/** Reports a failure that happened outside any command. */
function report(failure: Result<never>): void {
  write(render(failure, process.argv.includes('--json'), () => ''));
}
