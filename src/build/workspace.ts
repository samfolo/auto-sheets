/**
 * A build's workspace: a new directory outside the factory, where the agent builds a clone
 * from scratch. It gets copies of exactly what the agent needs (the spec, its operating manual,
 * the cases and the knowledge) and nothing from earlier builds. Its own Git history records the
 * agent's progress.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { attempt, PATHS, fail, ok, type Result } from '../kernel/index.ts';

/** What a new workspace is given, and where each copy goes inside it. */
const INPUTS = [
  { from: PATHS.clone.spec, to: 'SPEC.md' },
  { from: PATHS.clone.agents, to: 'AGENTS.md' },
  { from: PATHS.excelCases, to: 'cases' },
  { from: PATHS.excelKnowledge, to: 'knowledge' },
] as const;

/** Lets the agent run the factory's CLI from inside the workspace as `./factory`. */
const FACTORY_WRAPPER = `#!/bin/sh\nexec node "${PATHS.cli}" "$@"\n`;

const GITIGNORE = ['node_modules/', 'dist/', 'app.log', ''].join('\n');

const isInside = (child: string, parent: string): boolean => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

const checkLocation = (dir: string): Result<string> => {
  const absolute = resolve(dir);
  if (isInside(absolute, PATHS.root)) {
    return fail('INVALID_USAGE', 'A build workspace must be outside the factory.', {
      location: absolute,
      hint: 'Builds must not see the factory’s files or earlier builds. Choose a directory elsewhere.',
    });
  }
  if (existsSync(absolute) && readdirSync(absolute).length > 0) {
    return fail('INVALID_USAGE', 'A build workspace must be a new or empty directory.', {
      location: absolute,
      hint: 'Every build starts from scratch, so pick a directory that doesn’t exist yet.',
    });
  }
  return ok(absolute);
};

const git = (dir: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
};

/** Creates the workspace and commits its starting point. Returns its absolute path. */
export const prepareWorkspace = async (dir: string): Promise<Result<string>> => {
  const location = checkLocation(dir);
  if (!location.success) return location;
  const workspace = location.data;
  return attempt(
    async () => {
      await mkdir(workspace, { recursive: true });
      for (const { from, to } of INPUTS) {
        // Copies run in order so a failure names the input that caused it.
        // oxlint-disable-next-line no-await-in-loop
        await cp(from, join(workspace, to), { recursive: true });
      }
      await writeFile(join(workspace, 'factory'), FACTORY_WRAPPER);
      await chmod(join(workspace, 'factory'), 0o755);
      await writeFile(join(workspace, '.gitignore'), GITIGNORE);
      git(workspace, 'init', '--quiet');
      git(workspace, 'add', '--all');
      git(
        workspace,
        'commit',
        '--quiet',
        '--message',
        'chore: start from the factory’s spec, cases and knowledge',
      );
      return workspace;
    },
    (reason) =>
      fail('FILE_UNWRITABLE', 'Could not prepare the build workspace.', {
        location: workspace,
        details: [reason],
      }),
  );
};
