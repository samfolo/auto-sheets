import { expect } from 'vitest';
import { exitCodeFor, type ErrorCode, type FactoryError } from '../contracts/errors.ts';
import type { Result } from '../core/result.ts';
import type { CliRun } from './cli.ts';

/*
 * Assertions about outcomes, shared by every test. They accept either a Result or a
 * finished CLI run, so unit tests and end-to-end tests read the same way. For a CLI
 * run they also check the exit code that the error's category implies.
 */

type Outcome = CliRun | Result<unknown>;

const isCliRun = (received: Outcome): received is CliRun => 'args' in received;

const inspect = (received: Outcome) =>
  isCliRun(received)
    ? {
        result: received.result(),
        exitCode: received.status,
        subject: `\`factory ${received.args.join(' ')}\` (exit ${received.status})`,
      }
    : { result: received, exitCode: undefined, subject: 'the Result' };

const toSucceed = (received: Outcome) => {
  const { result, exitCode, subject } = inspect(received);
  const pass = result.success && (exitCode === undefined || exitCode === 0);
  return {
    pass,
    message: () => `expected ${subject} ${pass ? 'not ' : ''}to succeed`,
    actual: result,
  };
};

const toFailWith = (received: Outcome, code: ErrorCode, expected: Partial<FactoryError> = {}) => {
  const { result, exitCode, subject } = inspect(received);
  const wanted = { code, ...expected };
  const pass =
    !result.success &&
    (exitCode === undefined || exitCode === exitCodeFor(code)) &&
    expect.objectContaining(wanted).asymmetricMatch(result.error);
  return {
    pass,
    message: () =>
      `expected ${subject} ${pass ? 'not ' : ''}to fail with ${code} (exit ${exitCodeFor(code)})`,
    actual: result.success ? result : result.error,
    expected: wanted,
  };
};

export const matchers = { toSucceed, toFailWith };

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /** Succeeded; for a CLI run, also exited 0. */
    toSucceed: () => R;
    /** Failed with this code and contains `expected`; for a CLI run, also exited by category. */
    toFailWith: (code: ErrorCode, expected?: Partial<FactoryError>) => R;
  }
}
