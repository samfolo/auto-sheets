import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = join(root, 'artifacts');

/** Facts about the factory itself. Other modules read them from here instead of repeating them. */
export const PROJECT = {
  /** The command people and agents type. The type check keeps it in step with package.json. */
  cli: 'factory' satisfies keyof typeof packageJson.bin,
  version: packageJson.version,
  /** Node runs the TypeScript directly, which needs type stripping. Read from package.json. */
  minimumNodeMajor: Number(/\d+/.exec(packageJson.engines.node)?.[0]),
} as const;

/** Every location the factory reads or writes, resolved from the repository root. */
export const PATHS = {
  root,
  /** The CLI's entry point, for anything that needs to run the factory as a process. */
  cli: join(root, 'src', 'cli.ts'),
  /** Local settings and secrets. Gitignored. */
  envFile: join(root, '.env'),
  /** Local outputs such as logs, videos and traces. Gitignored. */
  artifacts,
  /** Where telemetry goes when no build has set FACTORY_LOG. */
  defaultLog: join(artifacts, 'factory.jsonl'),
} as const;
