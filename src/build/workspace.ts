/**
 * A build's workspace: a new directory outside the factory, where the agent builds a clone from
 * scratch. It holds the job's material: the standards' scaffold, the target's spec, the cases the
 * agent may see (recorded, and not held out, when the build started), the knowledge and the
 * documentation notes, and nothing else from the factory or from earlier builds. (The
 * standards themselves travel with the agent as context.) Its first commit names the factory
 * version that made it, and its Git history records the agent's progress from there.
 */
import { existsSync, readdirSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { CHECKPOINT } from '../agent/index.ts';
import { caseSchema, type LoadedCase, referenceSchema } from '../cases/index.ts';
import {
  attempt,
  fail,
  git,
  jsonSchemaOf,
  ok,
  PATHS,
  readStamp,
  type Result,
} from '../kernel/index.ts';

/** Where each input goes inside a workspace. */
export const WORKSPACE = {
  spec: 'SPEC.md',
  cases: 'cases',
  knowledge: 'knowledge',
  docs: 'docs',
} as const;

/**
 * The case files' formats, generated from their contracts, so the agent reads what each field and
 * step means instead of inferring it from examples.
 */
const CASE_FORMATS = [
  { file: 'case.schema.json', schema: caseSchema },
  { file: 'reference.schema.json', schema: referenceSchema },
] as const;

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

/** Runs Git as part of preparing the workspace, where any failure stops the preparation. */
const mustGit = (dir: string, ...args: string[]): void => {
  if (git(dir, ...args) === null) throw new Error(`git ${args[0]} failed.`);
};

/** The first commit's message, naming the factory version that made the workspace. */
const startingPoint = (): string => {
  const { version, commit, dirty } = readStamp();
  const at =
    commit === null ? '' : ` at ${commit.slice(0, 7)}${dirty === true ? ' with changes' : ''}`;
  return `chore: start from factory ${version}${at}`;
};

/**
 * Creates the workspace with the cases the agent may see, and commits its starting point.
 * Returns its path.
 */
export const prepareWorkspace = async (
  dir: string,
  cases: readonly LoadedCase[],
): Promise<Result<string>> => {
  const location = checkLocation(dir);
  if (!location.success) return location;
  const workspace = location.data;
  return attempt(
    async () => {
      await mkdir(workspace, { recursive: true });
      await cp(PATHS.standards.scaffold, workspace, { recursive: true });
      await cp(PATHS.cloneSpec, join(workspace, WORKSPACE.spec));
      for (const { id, definitionFile } of cases) {
        // oxlint-disable-next-line no-await-in-loop
        await cp(dirname(definitionFile), join(workspace, WORKSPACE.cases, ...id.split('/')), {
          recursive: true,
        });
      }
      for (const { file, schema } of CASE_FORMATS) {
        // oxlint-disable-next-line no-await-in-loop
        await writeFile(
          join(workspace, WORKSPACE.cases, file),
          `${JSON.stringify(jsonSchemaOf(schema), null, 2)}\n`,
        );
      }
      await cp(PATHS.excelKnowledge, join(workspace, WORKSPACE.knowledge), { recursive: true });
      await cp(PATHS.excelDocs, join(workspace, WORKSPACE.docs), { recursive: true });
      mustGit(workspace, 'init', '--quiet');
      mustGit(workspace, 'add', '--all');
      mustGit(workspace, 'commit', '--quiet', '--message', startingPoint());
      return workspace;
    },
    (reason) =>
      fail('FILE_UNWRITABLE', 'Could not prepare the build workspace.', {
        location: workspace,
        details: [reason],
      }),
  );
};

/** A commit where the agent's app reached a score, as `check_cases` recorded it. */
export interface Checkpoint {
  readonly commit: string;
  readonly passed: number;
}

/** The checkpoint with the highest score, the latest among equals; null if there is none. */
export const bestCheckpoint = (workspace: string): Checkpoint | null => {
  const log = git(workspace, 'log', '--format=%H %s') ?? '';
  const checkpoints = log.split('\n').flatMap((line) => {
    const [commit = '', ...subject] = line.split(' ');
    const match = CHECKPOINT.pattern.exec(subject.join(' '));
    return match === null ? [] : [{ commit, passed: Number(match[1]) }];
  });
  // The log is newest first, so the first of the highest is the latest.
  return checkpoints.reduce<Checkpoint | null>(
    (best, next) => (best === null || next.passed > best.passed ? next : best),
    null,
  );
};

/**
 * Puts the workspace back as it was at a checkpoint, as a new commit, so the agent's later work
 * stays in the history. Returns whether it worked.
 */
export const restoreCheckpoint = (workspace: string, { commit, passed }: Checkpoint): boolean =>
  git(workspace, 'read-tree', '-u', '--reset', commit) !== null &&
  git(
    workspace,
    'commit',
    '--quiet',
    '--message',
    `chore: restore the checkpoint at ${passed} cases, since the final state scored lower`,
  ) !== null;
