import { styleText } from 'node:util';
import { exitCodeFor, type FactoryError } from '../contracts/errors.ts';
import type { Result } from './result.ts';

/** What a finished command writes, and the exit code it ends with. */
export interface Rendered {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Turns a command's Result into terminal output.
 *
 * With --json, stdout is the Result itself on one line, whether it succeeded or not, so
 * an agent always parses one shape. Otherwise, success goes to stdout through the
 * command's own renderer, and failure goes to stderr.
 */
export function render<T>(
  result: Result<T>,
  json: boolean,
  renderData: (data: T) => string,
): Rendered {
  const exitCode = result.success ? 0 : exitCodeFor(result.error.code);
  if (json) return { stdout: `${JSON.stringify(result)}\n`, stderr: '', exitCode };
  if (result.success) return { stdout: asLines(renderData(result.data)), stderr: '', exitCode };
  return { stdout: '', stderr: formatError(result.error), exitCode };
}

export function formatError(error: FactoryError): string {
  const style = (format: 'red' | 'dim', text: string) =>
    styleText(format, text, { stream: process.stderr });
  const lines = [`${style('red', `✖ ${error.code}`)} ${error.message}`];
  if (error.location) lines.push(`  at ${error.location}`);
  for (const detail of error.details ?? []) lines.push(`  ${detail}`);
  if (error.hint) lines.push(style('dim', `  hint: ${error.hint}`));
  return asLines(lines.join('\n'));
}

function asLines(text: string): string {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`;
}
