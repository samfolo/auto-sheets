/**
 * Confining what an agent runs to its workspace, with macOS's built-in sandbox (Seatbelt,
 * `sandbox-exec`). Code the agent writes, and every command it runs, may read and write its own
 * workspace and temporary files, reach the network, and signal only processes inside the same
 * sandbox. It can't read the factory (its credentials, its references, the held-out cases) or
 * other builds, write anywhere else, or stop processes it didn't start.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PATHS } from './project.ts';

/** macOS's sandbox runner. */
export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/** Where tools write outside a workspace: temporary files and package caches. */
const SCRATCH = [
  '/private/tmp',
  '/private/var/folders',
  '/dev',
  join(homedir(), '.npm'),
  join(homedir(), 'Library', 'Caches'),
];

const subpaths = (paths: readonly string[]): string =>
  paths.map((path) => `(subpath ${JSON.stringify(path)})`).join(' ');

/**
 * The sandbox profile for one workspace. Later rules override earlier ones, so each rule narrows
 * or reopens what the one before it allowed. Profiles match absolute paths only, so the workspace
 * is resolved first.
 */
export const sandboxProfile = (workspace: string): string =>
  [
    '(version 1)',
    '(allow default)',
    '(deny signal)',
    '(allow signal (target same-sandbox))',
    `(deny file-read* ${subpaths([PATHS.root, PATHS.builds])})`,
    // Resolving a path inspects each folder above it, including the folder of builds itself.
    `(allow file-read-metadata (literal ${JSON.stringify(PATHS.builds)}))`,
    `(allow file-read* ${subpaths([resolve(workspace)])})`,
    '(deny file-write*)',
    `(allow file-write* ${subpaths([resolve(workspace), ...SCRATCH])})`,
  ].join('\n');

/** The arguments that run a command inside the workspace's sandbox. */
export const sandboxed = (
  workspace: string,
  command: string,
  args: readonly string[],
): { command: string; args: string[] } => ({
  command: SANDBOX_EXEC,
  args: ['-p', sandboxProfile(workspace), command, ...args],
});
