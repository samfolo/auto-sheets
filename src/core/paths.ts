import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The factory repository root, independent of the current working directory. */
export const factoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Local outputs such as logs, videos and traces. Gitignored. */
export const artifactsDir = join(factoryRoot, 'artifacts');
