import * as z from 'zod';

/**
 * The registry of every failure the factory can report.
 *
 * Each code belongs to a category, and the category decides the process exit code.
 * Scripts and agents can branch on the exit code or the code without parsing English,
 * and people get one specific sentence about what went wrong.
 */

/** Process exit codes by kind of failure. Success is 0. */
export const EXIT_CODES = {
  /** The command ran, and a check or comparison failed. */
  failed: 1,
  /** Arguments, files or data did not match what the command needs. */
  invalidInput: 2,
  /** A prerequisite is missing: a tool, a credential, a browser session. */
  environment: 3,
  /** A bug in the factory itself. */
  internal: 4,
} as const;

export type ErrorCategory = keyof typeof EXIT_CODES;

export const ERROR_CODES = {
  /** The command was called with unknown or malformed arguments. */
  INVALID_USAGE: 'invalidInput',
  /** Data did not match its contract in src/contracts. The details name each field and its purpose. */
  CONTRACT_VIOLATION: 'invalidInput',
  /** A file that should hold JSON could not be parsed. */
  INVALID_JSON: 'invalidInput',
  /** A file could not be read: usually it doesn't exist. */
  FILE_UNREADABLE: 'invalidInput',
  /** A file could not be written. */
  FILE_UNWRITABLE: 'environment',
  /** No case exists with the given id. */
  CASE_NOT_FOUND: 'invalidInput',
  /** Two recordings of the same case disagreed, so neither is trusted as a reference. */
  REFERENCE_UNSTABLE: 'failed',
  /** A prerequisite checked by `factory doctor` is missing or invalid. */
  ENVIRONMENT_NOT_READY: 'environment',
  /** A command needs the browser session, and none is running. */
  BROWSER_NOT_RUNNING: 'environment',
  /** `factory browser start` could not bring the browser up. */
  BROWSER_START_FAILED: 'environment',
  /** The browser didn't do what was asked: a page didn't load, or a control wasn't there. */
  BROWSER_ACTION_FAILED: 'environment',
  /** The factory threw unexpectedly. This is a bug; the stack trace is in the log. */
  INTERNAL: 'internal',
} as const satisfies Record<string, ErrorCategory>;

export type ErrorCode = keyof typeof ERROR_CODES;

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);

export const factoryErrorSchema = z
  .object({
    code: z.custom<ErrorCode>(isErrorCode, { error: 'is not a registered error code' }).meta({
      description: 'Which failure this is, from the registry in src/contracts/errors.ts.',
    }),
    message: z.string().meta({ description: 'One specific sentence: what went wrong.' }),
    location: z.string().optional().meta({
      description: 'Where it went wrong: a file, optionally followed by a path inside it.',
    }),
    details: z.array(z.string()).readonly().optional().meta({
      description: 'Supporting lines, such as each failed check or each schema issue.',
    }),
    hint: z.string().optional().meta({ description: 'The most useful next step.' }),
  })
  .readonly()
  .meta({
    description: 'A failure, described well enough that a person or an agent can act on it.',
  });

export type FactoryError = z.output<typeof factoryErrorSchema>;

export const exitCodeFor = (code: ErrorCode): number => EXIT_CODES[ERROR_CODES[code]];
