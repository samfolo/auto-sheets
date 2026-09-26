/**
 * The registry of every failure the factory can report.
 *
 * Each code belongs to a category, and the category decides the process exit code.
 * Scripts and agents can branch on the exit code or the code without parsing English,
 * and people get one specific sentence about what went wrong.
 */

/** Process exit codes by kind of failure. Success is 0. */
export const exitCodes = {
  /** The command ran, and a check or comparison failed. */
  failed: 1,
  /** Arguments, files or data did not match what the command needs. */
  invalidInput: 2,
  /** A prerequisite is missing: a tool, a credential, a browser session. */
  environment: 3,
  /** A bug in the factory itself. */
  internal: 4,
} as const;

export type ErrorCategory = keyof typeof exitCodes;

export const errorCodes = {
  /** The command was called with unknown or malformed arguments. */
  INVALID_USAGE: 'invalidInput',
  /** A prerequisite checked by `factory doctor` is missing or invalid. */
  ENVIRONMENT_NOT_READY: 'environment',
  /** The factory threw unexpectedly. This is a bug; the stack trace is in the log. */
  INTERNAL: 'internal',
} as const satisfies Record<string, ErrorCategory>;

export type ErrorCode = keyof typeof errorCodes;

/** A failure, described well enough that a person or an agent can act on it. */
export interface FactoryError {
  readonly code: ErrorCode;
  /** One specific sentence: what went wrong. */
  readonly message: string;
  /** Where it went wrong: a file, optionally followed by a path inside it. */
  readonly location?: string;
  /** Supporting lines, such as each failed check or each schema issue. */
  readonly details?: readonly string[];
  /** The most useful next step. */
  readonly hint?: string;
}

export function exitCodeFor(code: ErrorCode): number {
  return exitCodes[errorCodes[code]];
}
