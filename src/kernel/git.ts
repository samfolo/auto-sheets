import { execFileSync } from 'node:child_process';
import { childEnvironment } from './environment.ts';

/**
 * Runs Git in a directory and returns its trimmed output, or null if it fails. Git runs without
 * the factory's environment and without hooks, because a workspace's hooks are written by its
 * agent and would otherwise run with the factory's secrets.
 */
export const git = (cwd: string, ...args: string[]): string | null => {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd,
      env: childEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};
