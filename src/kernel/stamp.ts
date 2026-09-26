import * as z from 'zod';
import { git } from './git.ts';
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

export const readStamp = (): FactoryStamp => {
  const commit = git(PATHS.root, 'rev-parse', 'HEAD');
  const status = git(PATHS.root, 'status', '--porcelain');
  return {
    version: PROJECT.version,
    commit,
    dirty: status === null ? null : status.length > 0,
  };
};
