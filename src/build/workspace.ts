/**
 * A build's workspace: a new directory outside the factory, where the agent builds a clone from
 * scratch. It holds the job's material: the standards' scaffold, the target's spec, the cases the
 * agent may see and the knowledge, and nothing else from the factory or from earlier builds. (The
 * standards themselves travel with the agent as context.) Its first commit names the factory
 * version that made it, and its Git history records the agent's progress from there.
 */
import { existsSync, readdirSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { CASE_TAGS, caseSchema, loadAllCases, referenceSchema } from '../cases/index.ts';
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

/** The folders of the cases kept from the agent. */
const heldOutFolders = async (): Promise<Result<string[]>> => {
  const cases = await loadAllCases();
  if (!cases.success) return cases;
  return ok(
    cases.data
      .filter(({ definition }) => definition.tags.includes(CASE_TAGS.heldOut))
      .map(({ definitionFile }) => dirname(definitionFile)),
  );
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

/** Creates the workspace and commits its starting point. Returns its path. */
export const prepareWorkspace = async (dir: string): Promise<Result<string>> => {
  const location = checkLocation(dir);
  if (!location.success) return location;
  const workspace = location.data;
  const hidden = await heldOutFolders();
  if (!hidden.success) return hidden;
  return attempt(
    async () => {
      await mkdir(workspace, { recursive: true });
      await cp(PATHS.standards.scaffold, workspace, { recursive: true });
      await cp(PATHS.cloneSpec, join(workspace, WORKSPACE.spec));
      await cp(PATHS.excelCases, join(workspace, WORKSPACE.cases), {
        recursive: true,
        filter: (source) => !hidden.data.some((folder) => isInside(source, folder)),
      });
      for (const { file, schema } of CASE_FORMATS) {
        // oxlint-disable-next-line no-await-in-loop
        await writeFile(
          join(workspace, WORKSPACE.cases, file),
          `${JSON.stringify(jsonSchemaOf(schema), null, 2)}\n`,
        );
      }
      await cp(PATHS.excelKnowledge, join(workspace, WORKSPACE.knowledge), { recursive: true });
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
