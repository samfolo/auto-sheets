/**
 * Where cases live and how they're read and written. A case is a folder under
 * targets/excel/cases/; its id is the folder's path, such as `errors/division-by-zero`.
 * See targets/README.md for the layout and naming.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { caseSchema, type Case } from '../contracts/case.ts';
import { displayPath, readJsonFile, writeJsonFile } from '../contracts/files.ts';
import { referenceSchema, type Reference } from '../contracts/reference.ts';
import { PATHS, PROJECT } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';

export const CASE_FILES = {
  /** The steps, written by a person or the agent. */
  definition: 'case.json',
  /** What Excel did, written only by `factory case record`. */
  reference: 'reference.json',
} as const;

/** Lower-case words joined by hyphens, in folders joined by slashes. */
const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** A case read from disk, with where it lives. */
export interface LoadedCase {
  readonly id: string;
  readonly definition: Case;
  readonly definitionFile: string;
  readonly referenceFile: string;
  readonly recorded: boolean;
}

/** Every case id, sorted, so related cases sit together. */
export const listCaseIds = async (): Promise<string[]> => {
  if (!existsSync(PATHS.excelCases)) return [];
  const entries = await readdir(PATHS.excelCases, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith(`${sep}${CASE_FILES.definition}`))
    .map((entry) => dirname(entry).split(sep).join('/'))
    .toSorted();
};

export const loadCase = async (id: string): Promise<Result<LoadedCase>> => {
  if (!CASE_ID_PATTERN.test(id)) {
    return fail('INVALID_USAGE', `${JSON.stringify(id)} is not a case id.`, {
      hint: 'A case id is a folder path of lower-case, hyphenated words, such as errors/division-by-zero.',
    });
  }
  const folder = join(PATHS.excelCases, ...id.split('/'));
  const definitionFile = join(folder, CASE_FILES.definition);
  if (!existsSync(definitionFile)) {
    return fail('CASE_NOT_FOUND', `There is no case ${id}.`, {
      location: displayPath(definitionFile),
      hint: `Run \`${PROJECT.cli} case list\` to see the cases.`,
    });
  }
  const definition = await readJsonFile(definitionFile, caseSchema);
  if (!definition.success) return definition;
  const referenceFile = join(folder, CASE_FILES.reference);
  return ok({
    id,
    definition: definition.data,
    definitionFile,
    referenceFile,
    recorded: existsSync(referenceFile),
  });
};

export const readReference = (loaded: LoadedCase): Promise<Result<Reference>> =>
  readJsonFile(loaded.referenceFile, referenceSchema);

export const writeReference = (loaded: LoadedCase, reference: Reference): Promise<Result<string>> =>
  writeJsonFile(loaded.referenceFile, reference);
