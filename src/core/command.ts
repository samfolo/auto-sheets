import { render, type Rendered } from './render.ts';
import { fail, type Result } from './result.ts';
import { readStamp } from './stamp.ts';
import type { Telemetry } from './telemetry.ts';

/** One command invocation: what's running, and how it should report. */
export interface Invocation {
  readonly command: string;
  /** The arguments after the program name, as typed. */
  readonly argv: readonly string[];
  readonly json: boolean;
  readonly telemetry: Telemetry;
}

export const write = (output: Rendered): void => {
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
};

/** Converts something thrown into an INTERNAL error, logging the stack trace. */
export const internalError = (thrown: unknown, telemetry: Telemetry): Result<never> => {
  telemetry.logger.error({ err: thrown }, 'command.crash');
  return fail('INTERNAL', thrown instanceof Error ? thrown.message : String(thrown), {
    hint: `This is a bug in the factory. The stack trace is in ${telemetry.file}.`,
  });
};

const settle = async <T>(
  run: () => Promise<Result<T>>,
  telemetry: Telemetry,
): Promise<Result<T>> => {
  try {
    return await run();
  } catch (thrown) {
    return internalError(thrown, telemetry);
  }
};

/**
 * Runs a command and reports its Result. Logs the start and end, turns an unexpected
 * throw into an INTERNAL error, prints the output and sets the exit code.
 */
export const runCommand = async <T>(
  { command, argv, json, telemetry }: Invocation,
  run: () => Promise<Result<T>>,
  renderData: (data: T) => string,
): Promise<void> => {
  const started = performance.now();
  telemetry.logger.info({ command, argv, factory: readStamp() }, 'command.start');
  const result = await settle(run, telemetry);
  telemetry.logger.info(
    {
      command,
      success: result.success,
      code: result.success ? null : result.error.code,
      durationMs: Math.round(performance.now() - started),
    },
    'command.end',
  );
  write(render(result, json, renderData));
};
