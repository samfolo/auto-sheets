import { execFileSync } from 'node:child_process';
import { PATHS, PROJECT } from './project.ts';

/** Identifies the exact factory state behind a log line or a build. */
export interface FactoryStamp {
  readonly version: string;
  /** The Git commit, or null outside a Git checkout. */
  readonly commit: string | null;
  /** Whether there were uncommitted changes, or null outside a Git checkout. */
  readonly dirty: boolean | null;
}

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
