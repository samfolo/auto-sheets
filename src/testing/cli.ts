import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { commandOutputSchema, type CommandOutput } from '../contracts/output.ts';
import { logLineSchema, type LogLine } from '../contracts/telemetry.ts';
import { paths } from '../core/project.ts';
import { testCredentials } from './settings.ts';

/** A finished run of the real CLI. */
export interface CliRun {
  readonly args: readonly string[];
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The Result the CLI printed with --json, checked against the output contract. */
  readonly result: () => CommandOutput;
  /** The telemetry lines this run wrote, checked against the telemetry contract. */
  readonly events: () => readonly LogLine[];
}

const parseJson = (text: string, what: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected ${what} to be JSON, but got:\n${text}`);
  }
};

/** Parses a JSON document and checks it against its contract, failing the test if either fails. */
const parseAs = <Schema extends z.ZodType>(
  schema: Schema,
  text: string,
  what: string,
): z.output<Schema> => {
  const parsed = schema.safeParse(parseJson(text, what));
  if (parsed.success) return parsed.data;
  throw new Error(`${what} does not match its contract:\n${z.prettifyError(parsed.error)}`);
};

/**
 * Runs the real CLI in a child process, the way an agent does: with --json, test
 * credentials and a private log file. `env` overrides individual settings.
 */
export const runFactory = (
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): CliRun => {
  const logFile = join(mkdtempSync(join(tmpdir(), 'factory-test-')), 'events.jsonl');
  const child = spawnSync(process.execPath, [paths.cli, '--json', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...testCredentials, ...env, FACTORY_LOG: logFile },
  });
  return {
    args,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    result: () => parseAs(commandOutputSchema, child.stdout, 'stdout'),
    events: () =>
      readFileSync(logFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => parseAs(logLineSchema, line, 'a log line')),
  };
};
