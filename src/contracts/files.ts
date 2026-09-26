import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import type * as z from 'zod';
import { attempt } from '../core/attempt.ts';
import { PATHS } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';
import { validate } from './validate.ts';

/** A path relative to the repository, which is how errors name files. */
export const displayPath = (file: string): string => relative(PATHS.root, file) || file;

const parseJson = (text: string, file: string): Result<unknown> => {
  try {
    return ok(JSON.parse(text));
  } catch (thrown) {
    return fail('INVALID_JSON', `${displayPath(file)} is not valid JSON.`, {
      location: displayPath(file),
      details: [thrown instanceof Error ? thrown.message : String(thrown)],
    });
  }
};

/** Reads a JSON file and checks it against its contract. */
export const readJsonFile = async <S extends z.ZodType>(
  file: string,
  schema: S,
): Promise<Result<z.output<S>>> => {
  const text = await attempt(
    () => readFile(file, 'utf8'),
    (reason) =>
      fail('FILE_UNREADABLE', `Could not read ${displayPath(file)}.`, { details: [reason] }),
  );
  if (!text.success) return text;
  const json = parseJson(text.data, file);
  if (!json.success) return json;
  return validate(schema, json.data, displayPath(file));
};

/** Writes data as formatted JSON, creating folders as needed. */
export const writeJsonFile = async (file: string, data: unknown): Promise<Result<string>> =>
  attempt(
    async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
      return file;
    },
    (reason) =>
      fail('FILE_UNWRITABLE', `Could not write ${displayPath(file)}.`, { details: [reason] }),
  );
