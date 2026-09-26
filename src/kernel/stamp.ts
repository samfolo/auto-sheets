import { execFileSync } from 'node:child_process';
import * as z from 'zod';
import { PATHS, PROJECT } from './project.ts';

export const factoryStampSchema = z
  .strictObject({
    version: z.string().meta({ description: 'The factory’s version, from package.json.' }),
    commit: z
      .string()
      .nullable()
      .meta({ description: 'The Git commit, or null outside a Git checkout.' }),
    dirty: z.boolean().nullable().meta({
      description: 'Whether there were uncommitted changes, or null outside a Git checkout.',
    }),
  })
  .meta({ description: 'The exact factory state behind a log line or a build.' });

export type FactoryStamp = z.output<typeof factoryStampSchema>;

/** Runs a Git command in the factory root. Returns its trimmed output, or null if it fails. */
const git = (...args: string[]): string | null => {
  try {
    return execFileSync('git', args, {
      cwd: PATHS.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

export const readStamp = (): FactoryStamp => {
  const commit = git('rev-parse', 'HEAD');
  const status = git('status', '--porcelain');
  return {
    version: PROJECT.version,
    commit,
    dirty: status === null ? null : status.length > 0,
  };
};
